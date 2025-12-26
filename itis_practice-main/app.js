// Глобальные переменные приложения
let app = {
    // Типы помещений и их цвета (по умолчанию, могут быть переопределены из JSON)
    roomTypes: {
        "Учебное помещение": "#4CAF50",
        "Подсобное помещение": "#FFC107",
        "Административное": "#2196F3",
        "Коридор": "#9C27B0",
        "Санузел": "#607D8B",
        "Лаборатория": "#E91E63",
        "Склад": "#795548",
    },

    // Данные из JSON: здания, этажи, комнаты
    buildingsData: {},  // {building_id: {name, floors: [{floor_id, name, rooms: [{id, name, type, color}]}]}}
    selectedBuildingId: null,
    selectedFloorId: null,
    availableRooms: [],  // Список комнат для текущего этажа из JSON

    // Изображение
    baseImage: null,
    scale: 1.0,
    minScale: 0.3,
    maxScale: 3.0,

    // Режим работы: "idle" | "floor" | "room"
    mode: "idle",

    // Разметка этажа (полигон) — координаты в системе исходного изображения
    floorPoints: [],
    floorReady: false,

    // Комнаты (размеченные на плане)
    // [{room_id, name, type, color, points[(x,y),...]} ...]
    // room_id - ID из JSON, если комната из JSON, иначе null
    rooms: [],
    roomPoints: [],  // текущая рисуемая комната
    selectedRoomIndex: null,
    currentRoomId: null,  // ID комнаты из JSON, которую сейчас размечаем

    // DOM элементы
    canvas: null,
    ctx: null,
    buildingSelect: null,
    floorSelect: null,
    jsonRoomsList: null,
    annotatedRoomsList: null,
    roomNameInput: null,
    roomTypeSelect: null,
    statusBar: null,
    zoomLabel: null,

    // Инициализация приложения
    init: function() {
        // Получаем DOM элементы
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.buildingSelect = document.getElementById('buildingSelect');
        this.floorSelect = document.getElementById('floorSelect');
        this.jsonRoomsList = document.getElementById('jsonRoomsList');
        this.annotatedRoomsList = document.getElementById('annotatedRoomsList');
        this.roomNameInput = document.getElementById('roomNameInput');
        this.roomTypeSelect = document.getElementById('roomTypeSelect');
        this.statusBar = document.getElementById('statusBar');
        this.zoomLabel = document.getElementById('zoomLabel');


        // Индекс комнаты под курсором (-1, если нет)
        this.hoveredRoomIndex = -1;

        // Привязываем обработчики событий
        this.bindEvents();

        // Инициализируем легенду и обновляем селекты
        this.updateLegend();
        this.updateRoomTypeSelect();

        // Наведение мыши по canvas
        this.canvas.addEventListener("mousemove", (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / this.scale;
            const y = (e.clientY - rect.top) / this.scale;

            // Находим комнату под курсором
            this.hoveredRoomIndex = this.rooms.findIndex(room => this.pointInPolygon({x, y}, room.points));

            // Перерисовываем канвас
            this.redrawAll();
        });

        // Убираем hover, когда мышь покидает canvas
        this.canvas.addEventListener("mouseleave", () => {
            this.hoveredRoomIndex = -1;
            this.redrawAll();
        });
    },


    bindEvents: function() {
        // Кнопки управления
        document.getElementById('loadJsonBtn').addEventListener('click', () => this.loadJsonData());
        document.getElementById('loadImageBtn').addEventListener('click', () => this.loadImage());
        document.getElementById('loadFromFileBtn').addEventListener('click', () => this.loadFromFile());
        document.getElementById('startFloorBtn').addEventListener('click', () => this.startFloorMarkup());
        document.getElementById('finishFloorBtn').addEventListener('click', () => this.finishFloorMarkup());
        document.getElementById('startRoomBtn').addEventListener('click', () => this.startRoom());
        document.getElementById('finishRoomBtn').addEventListener('click', () => this.finishRoom());
        document.getElementById('undoBtn').addEventListener('click', () => this.undoLastPoint());
        document.getElementById('saveBtn').addEventListener('click', () => this.saveToFile());
        document.getElementById('exportHtmlBtn').addEventListener('click', () => this.exportToHtml());
        document.getElementById('zoomInBtn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOutBtn').addEventListener('click', () => this.zoomOut());
        document.getElementById('applyChangesBtn').addEventListener('click', () => this.applyRoomChanges());
        document.getElementById('deleteRoomBtn').addEventListener('click', () => this.deleteRoom());

        // Селекты
        this.buildingSelect.addEventListener('change', () => this.onBuildingSelect());
        this.floorSelect.addEventListener('change', () => this.onFloorSelect());

        // Ввод названия комнаты
        this.roomNameInput.addEventListener('input', () => {
            if (this.selectedRoomIndex !== null) {
                document.getElementById('applyChangesBtn').disabled = false;
            }
        });

        // Canvas события
        this.canvas.addEventListener('click', (e) => this.onCanvasClick(e));

        // Скрытие/показ файловых инпутов
        document.getElementById('jsonFileInput').addEventListener('change', (e) => this.handleJsonFile(e));
        document.getElementById('imageFileInput').addEventListener('change', (e) => this.handleImageFile(e));
        document.getElementById('coordsFileInput').addEventListener('change', (e) => this.handleCoordsFile(e));
    },

    // Загрузка JSON данных
    loadJsonData: function() {
        document.getElementById('jsonFileInput').click();
    },

    handleJsonFile: function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                // Парсим структуру JSON
                this.buildingsData = {};
                
                if ("buildings" in data) {
                    for (const building of data["buildings"]) {
                        const building_id = building.id || "";
                        const building_name = building.name || building_id;
                        const floors = [];
                        
                        for (const floor of building.floors || []) {
                            const floor_id = floor.id || "";
                            const floor_name = floor.name || floor_id;
                            const rooms = [];
                            
                            for (const room of floor.rooms || []) {
                                const room_id = room.id || "";
                                const room_name = room.name || room_id;
                                const room_type = room.type || "Учебное помещение";
                                const room_color = room.color || this.roomTypes[room_type] || "#AAAAAA";
                                
                                // Обновляем типы помещений, если есть новые
                                if (!this.roomTypes[room_type]) {
                                    this.roomTypes[room_type] = room_color;
                                }
                                
                                rooms.push({
                                    id: room_id,
                                    name: room_name,
                                    type: room_type,
                                    color: room_color
                                });
                            }
                            
                            floors.push({
                                id: floor_id,
                                name: floor_name,
                                rooms: rooms
                            });
                        }
                        
                        this.buildingsData[building_id] = {
                            name: building_name,
                            floors: floors
                        };
                    }
                }

                // Обновляем UI
                this.updateBuildingSelect();
                this.updateFloorSelect();
                this.updateJsonRoomsList();
                this.updateRoomTypeSelect();
                this.updateLegend();
                
                // Деактивируем кнопку загрузки изображения до выбора этажа
                document.getElementById('loadImageBtn').disabled = true;
                this.statusBar.textContent = "Шаг 2: Выберите здание из списка.";

                alert(`Загружено зданий: ${Object.keys(this.buildingsData).length}\nТеперь выберите здание и этаж.`);
            } catch (error) {
                alert(`Ошибка при загрузке JSON: ${error.message}`);
            }
        };
        reader.readAsText(file);
    },

    // Загрузка изображения
    loadImage: function() {
        if (!this.selectedFloorId) {
            alert("Сначала выберите здание и этаж.");
            return;
        }
        document.getElementById('imageFileInput').click();
    },

    handleImageFile: function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Устанавливаем изображение
                this.baseImage = img;
                
                // Устанавливаем размеры canvas
                this.canvas.width = img.width;
                this.canvas.height = img.height;
                
                // Сбрасываем все настройки
                this.scale = 1.0;
                this.mode = "idle";
                this.floorPoints = [];
                this.floorReady = false;
                this.rooms = [];
                this.roomPoints = [];
                this.selectedRoomIndex = null;
                
                // Обновляем список комнат
                this.refreshAnnotatedRoomsList();
                this.roomNameInput.value = '';
                
                // Включаем элементы управления
                document.getElementById('startFloorBtn').disabled = false;
                document.getElementById('finishFloorBtn').disabled = true;
                document.getElementById('startRoomBtn').disabled = false;  // теперь можно, т.к. изображение загружено
                document.getElementById('finishRoomBtn').disabled = true;
                document.getElementById('undoBtn').disabled = true;
                document.getElementById('saveBtn').disabled = true;
                document.getElementById('exportHtmlBtn').disabled = true;
                document.getElementById('zoomInBtn').disabled = false;
                document.getElementById('zoomOutBtn').disabled = false;
                document.getElementById('applyChangesBtn').disabled = true;
                document.getElementById('deleteRoomBtn').disabled = true;

                this.statusBar.textContent = "Шаг 5: Нажмите 'Разметка этажа' и обведите границу этажа (полигон).";
                
                this.redrawAll();
            };
            img.onerror = () => {
                alert("Не удалось загрузить изображение.");
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    // Загрузка координат из файла
    loadFromFile: function() {
        if (!this.selectedFloorId) {
            alert("Сначала выберите здание и этаж.");
            return;
        }
        if (!this.baseImage) {
            alert("Сначала загрузите изображение плана этажа.");
            return;
        }
        document.getElementById('coordsFileInput').click();
    },

    handleCoordsFile: function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                const lines = content.split('\n');

                // Парсинг файла
                const floorPoints = [];
                const rooms = [];
                let currentRoom = null;
                let currentSection = null; // "floor" или "room"
                
                for (const line of lines) {
                    let trimmedLine = line.trim();
                    if (!trimmedLine) {
                        if (currentRoom !== null) {
                            // Завершаем текущую комнату
                            if (currentRoom.points.length >= 3) {
                                rooms.push(currentRoom);
                            }
                            currentRoom = null;
                        }
                        currentSection = null;
                        continue;
                    }
                    
                    if (trimmedLine.startsWith("ЗДАНИЕ:")) {
                        // Парсим информацию о здании (для совместимости)
                        continue;
                    }
                    if (trimmedLine.startsWith("ЭТАЖ:")) {
                        // Парсим информацию об этаже (для совместимости)
                        continue;
                    }
                    if (trimmedLine === "ЭТАЖ:" || trimmedLine === "КОНТУР_ЭТАЖА:") {
                        currentSection = "floor";
                        floorPoints.length = 0; // очищаем массив
                        continue;
                    }
                    
                    if (currentSection === "floor") {
                        // Парсим координаты этажа
                        if (trimmedLine.includes(";")) {
                            try {
                                const [x, y] = trimmedLine.split(";");
                                floorPoints.push({x: parseFloat(x), y: parseFloat(y)});
                            } catch (e) {
                                continue;
                            }
                        }
                    }
                    
                    else if (trimmedLine.includes(":") && !trimmedLine.startsWith("ЗДАНИЕ:") && 
                             !trimmedLine.startsWith("ЭТАЖ:") && trimmedLine !== "КОНТУР_ЭТАЖА:") {
                        // Начало новой комнаты: "Название (Тип) [room_id]:" или "Название (Тип):" или "Название:"
                        if (currentRoom !== null) {
                            // Сохраняем предыдущую комнату
                            if (currentRoom.points.length >= 3) {
                                rooms.push(currentRoom);
                            }
                        }
                        
                        // Парсим название, тип и room_id
                        try {
                            let namePart = trimmedLine.substring(0, trimmedLine.lastIndexOf(":")).trim();
                            let room_id = null;
                            let name = null;
                            let room_type = null;
                            
                            // Проверяем наличие room_id в квадратных скобках
                            if (namePart.includes("[") && namePart.includes("]")) {
                                const startIdx = namePart.lastIndexOf("[");
                                const endIdx = namePart.lastIndexOf("]");
                                room_id = namePart.substring(startIdx + 1, endIdx);
                                namePart = namePart.substring(0, startIdx).trim();
                            }

                            if (namePart.includes("(") && namePart.includes(")")) {
                                // Формат: "Название (Тип)"
                                const nameEndIdx = namePart.lastIndexOf("(");
                                name = namePart.substring(0, nameEndIdx).trim();
                                const typePart = namePart.substring(nameEndIdx + 1, namePart.lastIndexOf(")")).trim();
                                room_type = typePart;

                                // Проверяем, что тип существует
                                if (!this.roomTypes[room_type]) {
                                    // Если тип не найден, используем первый доступный
                                    room_type = Object.keys(this.roomTypes)[0] || "Учебное помещение";
                                }
                            } else {
                                // Формат: "Название" (старый формат без типа)
                                name = namePart;
                                room_type = Object.keys(this.roomTypes)[0] || "Учебное помещение";
                            }

                            // Получаем цвет для типа
                            const color = this.roomTypes[room_type] || "#AAAAAA";

                            currentRoom = {
                                room_id: room_id,
                                name: name,
                                type: room_type,
                                color: color,
                                points: []
                            };
                            currentSection = "room";
                        } catch (e) {
                            continue;
                        }
                    }

                    else if (currentSection === "room" && currentRoom !== null) {
                        // Парсим координаты комнаты
                        if (trimmedLine.includes(";")) {
                            try {
                                const [x, y] = trimmedLine.split(";");
                                currentRoom.points.push({x: parseFloat(x), y: parseFloat(y)});
                            } catch (e) {
                                continue;
                            }
                        }
                    }
                }

                // Сохраняем последнюю комнату, если есть
                if (currentRoom !== null && currentRoom.points.length >= 3) {
                    rooms.push(currentRoom);
                }

                // Проверяем валидность данных
                if (floorPoints.length < 3) {
                    alert("В файле не найдена корректная разметка этажа (минимум 3 точки).");
                    return;
                }

                // Восстанавливаем состояние
                this.floorPoints = floorPoints.map(p => ({x: p.x, y: p.y}));
                this.floorReady = true;
                this.rooms = rooms.map(r => ({
                    ...r,
                    points: r.points.map(p => ({x: p.x, y: p.y}))
                }));
                this.roomPoints = [];
                this.selectedRoomIndex = null;
                this.mode = "idle";

                // Обновляем UI
                this.refreshAnnotatedRoomsList();
                this.roomNameInput.value = '';
                if (rooms.length > 0) {
                    this.roomTypeSelect.value = rooms[0].type;
                } else {
                    this.roomTypeSelect.value = Object.keys(this.roomTypes)[0] || "Учебное помещение";
                }

                // Обновляем состояние кнопок
                document.getElementById('startFloorBtn').disabled = false;
                document.getElementById('finishFloorBtn').disabled = true;
                document.getElementById('startRoomBtn').disabled = false;
                document.getElementById('finishRoomBtn').disabled = true;
                document.getElementById('undoBtn').disabled = true;

                if (rooms.length > 0) {
                    document.getElementById('saveBtn').disabled = false;
                    document.getElementById('exportHtmlBtn').disabled = false;
                } else {
                    document.getElementById('saveBtn').disabled = true;
                    document.getElementById('exportHtmlBtn').disabled = true;
                }

                document.getElementById('applyChangesBtn').disabled = true;
                document.getElementById('deleteRoomBtn').disabled = true;

                this.statusBar.textContent = `Загружено: этаж (${floorPoints.length} точек), комнат: ${rooms.length}. Можно продолжить разметку.`;

                this.redrawAll();
                alert(`Загружено:\n- Этаж: ${floorPoints.length} точек\n- Комнат: ${rooms.length}`);
            } catch (error) {
                alert(`Не удалось загрузить файл: ${error.message}`);
            }
        };
        reader.readAsText(file);
    },

    // Обновление селекта зданий
    updateBuildingSelect: function() {
        this.buildingSelect.innerHTML = '<option value="">Не выбрано</option>';
        
        for (const [buildingId, buildingData] of Object.entries(this.buildingsData)) {
            const option = document.createElement('option');
            option.value = buildingId;
            option.textContent = `${buildingData.name} (${buildingId})`;
            this.buildingSelect.appendChild(option);
        }
        
        // Устанавливаем первое здание по умолчанию, если есть
        if (Object.keys(this.buildingsData).length > 0) {
            const firstId = Object.keys(this.buildingsData)[0];
            this.buildingSelect.value = firstId;
            this.onBuildingSelect();
        }
    },

    // Обновление селекта этажей
    updateFloorSelect: function() {
        this.floorSelect.innerHTML = '<option value="">Не выбран</option>';
        
        if (!this.selectedBuildingId || !this.buildingsData[this.selectedBuildingId]) {
            this.selectedFloorId = null;
            return;
        }
        
        const building = this.buildingsData[this.selectedBuildingId];
        const floors = building.floors || [];
        
        for (const floor of floors) {
            const option = document.createElement('option');
            option.value = floor.id;
            option.textContent = `${floor.name} (${floor.id})`;
            this.floorSelect.appendChild(option);
        }
        
        // Устанавливаем первый этаж по умолчанию, если есть
        if (floors.length > 0) {
            this.floorSelect.value = floors[0].id;
            this.onFloorSelect();
        }
    },

    // Обновление списка доступных комнат из JSON
    updateJsonRoomsList: function() {
        this.jsonRoomsList.innerHTML = '';
        this.availableRooms = [];
        
        if (!this.selectedBuildingId || !this.selectedFloorId) {
            return;
        }
        
        const building = this.buildingsData[this.selectedBuildingId];
        if (!building) return;
        
        for (const floor of building.floors || []) {
            if (floor.id === this.selectedFloorId) {
                this.availableRooms = floor.rooms || [];
                for (const room of this.availableRooms) {
                    const div = document.createElement('div');
                    div.className = 'room-list-item';
                    div.textContent = `${room.name} (${room.type})`;
                    div.dataset.roomId = room.id;
                    div.addEventListener('click', () => this.onJsonRoomSelect(room.id));
                    this.jsonRoomsList.appendChild(div);
                }
                break;
            }
        }
    },

    // Обновление списка размеченных комнат
    refreshAnnotatedRoomsList: function() {
        this.annotatedRoomsList.innerHTML = '';
        
        for (let i = 0; i < this.rooms.length; i++) {
            const room = this.rooms[i];
            const div = document.createElement('div');
            div.className = 'room-list-item';
            if (i === this.selectedRoomIndex) {
                div.classList.add('selected');
            }
            div.textContent = `${room.name} (${room.type})`;
            div.dataset.index = i;
            div.addEventListener('click', () => this.onRoomSelect(i));
            this.annotatedRoomsList.appendChild(div);
        }
    },

    // Обновление селекта типов помещений
    updateRoomTypeSelect: function() {
        this.roomTypeSelect.innerHTML = '';
        
        for (const [type, color] of Object.entries(this.roomTypes)) {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            this.roomTypeSelect.appendChild(option);
        }
    },

    // Обновление легенды
    updateLegend: function() {
        const legend = document.getElementById('legend');
        legend.innerHTML = '';
        
        for (const [type, color] of Object.entries(this.roomTypes)) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'legend-item';

            const colorDiv = document.createElement('div');
            colorDiv.className = 'legend-color';
            colorDiv.style.backgroundColor = color;

            const label = document.createElement('div');
            label.textContent = type;

            itemDiv.appendChild(colorDiv);
            itemDiv.appendChild(label);
            legend.appendChild(itemDiv);
        }
    },

    // Обработка выбора здания
    onBuildingSelect: function() {
        const buildingId = this.buildingSelect.value;
        
        if (buildingId && this.buildingsData[buildingId]) {
            this.selectedBuildingId = buildingId;
            this.updateFloorSelect();
            this.updateJsonRoomsList();
            
            // Деактивируем кнопку загрузки изображения до выбора этажа
            document.getElementById('loadImageBtn').disabled = false;
            this.statusBar.textContent = "Шаг 3: Выберите этаж из списка.";
            
            // Сбрасываем разметку при смене здания
            this.resetMarkup();
        } else {
            this.selectedBuildingId = null;
            this.selectedFloorId = null;
            this.updateFloorSelect();
            this.updateJsonRoomsList();
            document.getElementById('loadImageBtn').disabled = true;
            this.statusBar.textContent = "Шаг 2: Выберите здание из списка.";
        }
    },

    // Обработка выбора этажа
    onFloorSelect: function() {
        const floorId = this.floorSelect.value;
        
        if (floorId && this.selectedBuildingId) {
            const building = this.buildingsData[this.selectedBuildingId];
            if (building) {
                for (const floor of building.floors || []) {
                    if (floor.id === floorId) {
                        this.selectedFloorId = floorId;
                        this.updateJsonRoomsList();
                        
                        // Активируем кнопку загрузки изображения после выбора этажа
                        document.getElementById('loadImageBtn').disabled = false;
                        this.statusBar.textContent = "Шаг 4: Загрузите схему этажа (изображение плана).";
                        
                        // Сбрасываем разметку при смене этажа
                        this.resetMarkup();
                        return;
                    }
                }
            }
        }
        
        this.selectedFloorId = null;
        this.updateJsonRoomsList();
        document.getElementById('loadImageBtn').disabled = true;
        if (this.selectedBuildingId) {
            this.statusBar.textContent = "Шаг 3: Выберите этаж из списка.";
        } else {
            this.statusBar.textContent = "Шаг 2: Выберите здание из списка.";
        }
    },

    // Обработка выбора комнаты из JSON списка
    onJsonRoomSelect: function(roomId) {
        this.currentRoomId = roomId;
        
        // Если этаж уже размечен, можно начать разметку комнаты
        if (this.floorReady) {
            this.startRoom();
        }
    },

    // Обработка выбора размеченной комнаты
    onRoomSelect: function(index) {
        this.selectedRoomIndex = index;
        
        const room = this.rooms[index];
        this.roomNameInput.value = room.name;
        
        // Устанавливаем тип, если он есть
        if (room.type && this.roomTypes[room.type]) {
            this.roomTypeSelect.value = room.type;
        } else {
            // Если тип не в списке, добавляем его
            this.roomTypeSelect.value = room.type;
        }

        document.getElementById('applyChangesBtn').disabled = false;
        document.getElementById('deleteRoomBtn').disabled = false;

        this.refreshAnnotatedRoomsList();
        this.redrawAll();
    },

    // Сброс разметки
    resetMarkup: function() {
        this.floorPoints = [];
        this.floorReady = false;
        this.rooms = [];
        this.roomPoints = [];
        this.selectedRoomIndex = null;
        this.currentRoomId = null;
        this.mode = "idle";
        
        this.refreshAnnotatedRoomsList();
        this.roomNameInput.value = '';
        this.redrawAll();
    },

    // Начало разметки этажа
    startFloorMarkup: function() {
        if (!this.baseImage) {
            alert("Сначала загрузите изображение.");
            return;
        }
        if (!this.selectedBuildingId) {
            alert("Сначала выберите здание.");
            return;
        }
        if (!this.selectedFloorId) {
            alert("Сначала выберите этаж.");
            return;
        }

        // Если уже есть комнаты/этаж — предупредим, что сбросится
        if (this.floorReady || this.rooms.length > 0) {
            if (!confirm("Разметка этажа будет начата заново.\nВсе комнаты будут удалены. Продолжить?")) {
                return;
            }
        }

        this.mode = "floor";
        this.floorPoints = [];
        this.floorReady = false;

        // при новой разметке этажа — комнаты сбрасываем
        this.rooms = [];
        this.roomPoints = [];
        this.selectedRoomIndex = null;
        this.refreshAnnotatedRoomsList();
        this.roomNameInput.value = '';

        document.getElementById('startRoomBtn').disabled = true;
        document.getElementById('finishRoomBtn').disabled = true;
        document.getElementById('saveBtn').disabled = true;
        document.getElementById('exportHtmlBtn').disabled = true;

        document.getElementById('finishFloorBtn').disabled = false;
        document.getElementById('undoBtn').disabled = false;

        document.getElementById('applyChangesBtn').disabled = true;
        document.getElementById('deleteRoomBtn').disabled = true;

        this.statusBar.textContent = "Разметка этажа: кликайте по углам границы. Затем 'Завершить разметку этажа'.";
        this.redrawAll();
    },

    // Завершение разметки этажа
    finishFloorMarkup: function() {
        if (this.mode !== "floor") {
            return;
        }

        if (this.floorPoints.length < 3) {
            alert("Граница этажа должна иметь минимум 3 точки.");
            return;
        }

        this.floorReady = true;
        this.mode = "idle";

        document.getElementById('finishFloorBtn').disabled = true;
        document.getElementById('undoBtn').disabled = true;

        // Теперь можно создавать комнаты (внутри этажа)
        document.getElementById('startRoomBtn').disabled = false;
        
        // Кнопка экспорта доступна только если есть комнаты
        if (this.rooms.length > 0) {
            document.getElementById('exportHtmlBtn').disabled = false;
        }

        this.statusBar.textContent = "Этаж размечен. Теперь выберите комнату из списка и создавайте разметку внутри границы этажа.";
        this.redrawAll();
    },

    // Начало создания комнаты
    startRoom: function() {
        if (!this.baseImage) {
            alert("Сначала загрузите изображение.");
            return;
        }
        if (!this.selectedBuildingId) {
            alert("Сначала выберите здание.");
            return;
        }
        if (!this.selectedFloorId) {
            alert("Сначала выберите этаж.");
            return;
        }
        if (!this.floorReady) {
            alert("Сначала нужно завершить разметку этажа.");
            return;
        }
        if (!this.currentRoomId && this.availableRooms.length === 0) {
            alert("Выберите комнату из списка доступных комнат или убедитесь, что для этажа есть комнаты в JSON.");
            return;
        }

        this.mode = "room";
        this.roomPoints = [];
        document.getElementById('finishRoomBtn').disabled = false;
        document.getElementById('undoBtn').disabled = false;

        let roomInfo = "";
        if (this.currentRoomId) {
            for (const room of this.availableRooms) {
                if (room.id === this.currentRoomId) {
                    roomInfo = ` (${room.name} - ${room.type})`;
                    break;
                }
            }
        }
        
        this.statusBar.textContent = `Создание комнаты${roomInfo}: кликайте по углам внутри этажа. 'Отменить точку' удаляет последнюю.`;
        this.redrawAll();
    },

    // Завершение создания комнаты
    finishRoom: function() {
        if (this.mode !== "room") {
            return;
        }

        if (this.roomPoints.length < 3) {
            alert("Комната должна иметь минимум 3 точки.");
            return;
        }

        // финальная проверка: все точки внутри этажа
        for (const point of this.roomPoints) {
            if (!this.pointInPolygon(point.x, point.y, this.floorPoints)) {
                alert("Контур комнаты должен полностью находиться внутри границы этажа.");
                return;
            }
        }

        // Проверяем, выбрана ли комната из JSON
        const room_id = this.currentRoomId;
        let name = null;
        let rtype = null;
        let color = null;
        
        if (room_id && this.availableRooms.length > 0) {
            // Ищем комнату в доступных комнатах
            for (const room of this.availableRooms) {
                if (room.id === room_id) {
                    name = room.name;
                    rtype = room.type;
                    color = room.color;
                    break;
                }
            }
        }
        
        // Если комната не из JSON, используем значения по умолчанию
        if (!name) {
            let base = "Комната";
            let n = 1;
            while (this.roomNameExists(`${base} ${n}`)) {
                n += 1;
            }
            name = `${base} ${n}`;
        }
        
        if (!rtype) {
            rtype = this.roomTypeSelect.value;
            if (!this.roomTypes[rtype]) {
                rtype = Object.keys(this.roomTypes)[0] || "Учебное помещение";
            }
        }
        
        if (!color) {
            color = this.roomTypes[rtype] || "#AAAAAA";
        }

        this.rooms.push({
            room_id: room_id,
            name: name,
            type: rtype,
            color: color,
            points: [...this.roomPoints]
        });
        this.roomPoints = [];
        this.currentRoomId = null;

        this.mode = "idle";
        document.getElementById('finishRoomBtn').disabled = true;
        document.getElementById('undoBtn').disabled = true;

        document.getElementById('saveBtn').disabled = false;
        document.getElementById('exportHtmlBtn').disabled = false;
        this.refreshAnnotatedRoomsList();

        // Автоматическое сохранение после добавления комнаты
        // this.saveToFile(true); // в браузере сохранение в файл не будет работать автоматически

        this.statusBar.textContent = `Комната сохранена. Всего комнат: ${this.rooms.length}`;
        this.redrawAll();
    },

    // Отмена последней точки
    undoLastPoint: function() {
        if (this.mode === "floor") {
            if (this.floorPoints.length > 0) {
                this.floorPoints.pop();
                this.redrawAll();
            }
        } else if (this.mode === "room") {
            if (this.roomPoints.length > 0) {
                this.roomPoints.pop();
                this.redrawAll();
            }
        }
    },

    // Обработка клика по canvas
    onCanvasClick: function(event) {
        if (!this.baseImage) {
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        const x_img = (event.clientX - rect.left) * scaleX / this.scale;
        const y_img = (event.clientY - rect.top) * scaleY / this.scale;

        if (this.mode === "floor") {
            this.floorPoints.push({x: x_img, y: y_img});
            this.redrawAll();
            return;
        }

        if (this.mode === "room") {
            // Запрещаем ставить точки комнаты за пределами этажа
            if (!this.floorReady) {
                return;
            }
            if (!this.pointInPolygon(x_img, y_img, this.floorPoints)) {
                alert("Точки комнаты должны быть внутри границы этажа.");
                return;
            }

            this.roomPoints.push({x: x_img, y: y_img});
            this.redrawAll();
            return;
        }
    },

    

    // Увеличение масштаба
    zoomIn: function() {
        if (!this.baseImage) {
            return;
        }
        this.scale = Math.min(this.maxScale, this.scale * 1.25);
        this.redrawAll();
    },

    // Уменьшение масштаба
    zoomOut: function() {
        if (!this.baseImage) {
            return;
        }
        this.scale = Math.max(this.minScale, this.scale / 1.25);
        this.redrawAll();
    },

    // Применение изменений к комнате
    applyRoomChanges: function() {
        if (this.selectedRoomIndex === null) {
            alert("Сначала выберите комнату в списке.");
            return;
        }

        const idx = this.selectedRoomIndex;
        const newName = this.roomNameInput.value.trim();
        const newType = this.roomTypeSelect.value;

        if (!newName) {
            alert("Название комнаты не может быть пустым.");
            return;
        }

        if (this.roomNameExists(newName, idx)) {
            alert("Комната с таким именем уже существует. Выберите другое имя.");
            return;
        }

        // Обновляем тип и цвет
        const newColor = this.roomTypes[newType] || this.rooms[idx].color || "#AAAAAA";
        
        this.rooms[idx].name = newName;
        this.rooms[idx].type = newType;
        this.rooms[idx].color = newColor;

        this.refreshAnnotatedRoomsList();
        
        // Выбираем ту же комнату снова, чтобы подсветить
        const roomItems = this.annotatedRoomsList.querySelectorAll('.room-list-item');
        if (roomItems[idx]) {
            roomItems[idx].classList.add('selected');
        }
        
        this.redrawAll();
        document.getElementById('applyChangesBtn').disabled = true;
    },

    // Удаление комнаты
    deleteRoom: function() {
        if (this.selectedRoomIndex === null) {
            alert("Сначала выберите комнату в списке.");
            return;
        }

        const idx = this.selectedRoomIndex;
        this.rooms.splice(idx, 1);
        this.selectedRoomIndex = null;

        this.refreshAnnotatedRoomsList();
        this.roomNameInput.value = '';

        if (this.rooms.length > 0) {
            document.getElementById('saveBtn').disabled = false;
            document.getElementById('exportHtmlBtn').disabled = false;
        } else {
            document.getElementById('saveBtn').disabled = true;
            document.getElementById('exportHtmlBtn').disabled = true;
            document.getElementById('applyChangesBtn').disabled = true;
            document.getElementById('deleteRoomBtn').disabled = true;
        }

        this.redrawAll();
    },

    // Сохранение в файл
    saveToFile: function(silent = false) {
        if (!this.floorReady) {
            if (!silent) alert("Сначала завершите разметку этажа.");
            return false;
        }
        if (this.rooms.length === 0) {
            if (!silent) alert("Нет комнат для сохранения.");
            return false;
        }
        if (!this.selectedBuildingId || !this.selectedFloorId) {
            if (!silent) alert("Сначала выберите здание и этаж.");
            return false;
        }

        // Создаем содержимое файла
        let content = "";
        
        // Информация о здании и этаже
        const buildingName = this.buildingsData[this.selectedBuildingId]?.name || this.selectedBuildingId;
        let floorName = "";
        if (this.selectedBuildingId in this.buildingsData) {
            for (const floor of this.buildingsData[this.selectedBuildingId].floors || []) {
                if (floor.id === this.selectedFloorId) {
                    floorName = floor.name;
                    break;
                }
            }
        }

        content += `ЗДАНИЕ: ${this.selectedBuildingId} (${buildingName})\n`;
        content += `ЭТАЖ: ${this.selectedFloorId} (${floorName})\n`;
        content += "\n";

        // Контур этажа
        content += "КОНТУР_ЭТАЖА:\n";
        for (const point of this.floorPoints) {
            content += `${Math.round(point.x)};${Math.round(point.y)}\n`;
        }
        content += "\n";

        // Комнаты
        for (const room of this.rooms) {
            const roomIdStr = room.room_id ? ` [${room.room_id}]` : "";
            content += `${room.name} (${room.type})${roomIdStr}:\n`;
            for (const point of room.points) {
                content += `${Math.round(point.x)};${Math.round(point.y)}\n`;
            }
            content += "\n";
        }

        // Создаем и скачиваем файл
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'rooms_coordinates.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (!silent) alert("Координаты сохранены в файл rooms_coordinates.txt");
        return true;
    },

    // Экспорт в HTML
    exportToHtml: function() {
        if (!this.floorReady) {
            alert("Сначала завершите разметку этажа.");
            return;
        }
        if (this.rooms.length === 0) {
            alert("Нет комнат для экспорта.");
            return;
        }
        if (!this.baseImage) {
            alert("Нет изображения для определения размеров.");
            return;
        }

        // Получаем информацию о здании и этаже
        const buildingName = this.buildingsData[this.selectedBuildingId]?.name || "Неизвестно";
        let floorName = "Неизвестно";
        if (this.selectedBuildingId && this.selectedBuildingId in this.buildingsData) {
            for (const floor of this.buildingsData[this.selectedBuildingId].floors || []) {
                if (floor.id === this.selectedFloorId) {
                    floorName = floor.name;
                    break;
                }
            }
        }

        // Создаем HTML с SVG
        let htmlContent = `<!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>План этажа - ${buildingName} - ${floorName}</title>
            <style>
                body {
                    margin: 0;
                    padding: 20px;
                    font-family: Arial, sans-serif;
                    background-color: #f5f5f5;
                }
                .container {
                    background-color: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    max-width: 100%;
                    overflow: auto;
                }
                h1 {
                    margin-top: 0;
                    color: #333;
                }
                .info {
                    margin-bottom: 20px;
                    color: #666;
                }
                svg {
                    border: 1px solid #ddd;
                    background-color: white;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>План этажа</h1>
                <div class="info">
                    <p><strong>Здание:</strong> ${buildingName}</p>
                    <p><strong>Этаж:</strong> ${floorName}</p>
                    <p><strong>Комнат размечено:</strong> ${this.rooms.length}</p>
                </div>
                <svg width="${this.canvas.width}" height="${this.canvas.height}" xmlns="http://www.w3.org/2000/svg">`;

        // Добавляем полигон этажа
        if (this.floorPoints.length >= 3) {
            const floorPointsStr = this.floorPoints.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(" ");
            htmlContent += `            <!-- Контур этажа -->
            <polygon points="${floorPointsStr}"
                     fill="none"
                     stroke="black"
                     stroke-width="4"
                     stroke-dasharray="8,6"
                     opacity="0.8"/>
`;
        }

        // Добавляем полигоны комнат
        for (let idx = 0; idx < this.rooms.length; idx++) {
            const room = this.rooms[idx];
            const pts = room.points || [];
            if (pts.length < 3) continue;

            const roomName = room.name || `Комната ${idx + 1}`;
            const roomType = room.type || "";
            const fillColor = room.color || "#AAAAAA";

            const pointsStr = pts.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(" ");

            ///

             const center = this.getPolygonCenter(pts);

            htmlContent += `
            <polygon points="${pointsStr}"
                    fill="${fillColor}"
                    fill-opacity="0.5"
                    stroke="red"
                    stroke-width="2"
                    opacity="0.9">
                <title>${roomName} - ${roomType}</title>
            </polygon>

            <text x="${Math.round(center.x)}"
                y="${Math.round(center.y)}"
                text-anchor="middle"
                dominant-baseline="middle"
                font-size="12"
                fill="#000"
                pointer-events="none">
                ${roomName}
            </text>
            `;

        }

        htmlContent += `        </svg>
    </div>
</body>
</html>`;

        // Создаем и скачиваем HTML файл
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plan_${this.selectedBuildingId}_${this.selectedFloorId}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert("HTML файл сохранен");
    },

    // Проверка, находится ли точка внутри полигона (алгоритм ray casting)
    pointInPolygon: function(x, y, poly) {
        let inside = false;
        const n = poly.length;
        if (n < 3) {
            return false;
        }
        let j = n - 1;
        for (let i = 0; i < n; i++) {
            const xi = poly[i].x, yi = poly[i].y;
            const xj = poly[j].x, yj = poly[j].y;
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi);
            if (intersect) inside = !inside;
            j = i;
        }
        return inside;
    },

    // Проверка, существует ли комната с таким именем
    roomNameExists: function(name, exceptIndex = null) {
        for (let i = 0; i < this.rooms.length; i++) {
            if (exceptIndex !== null && i === exceptIndex) {
                continue;
            }
            if (this.rooms[i].name === name) {
                return true;
            }
        }
        return false;
    },

    // Обновление метки масштаба
    updateZoomLabel: function() {
        this.zoomLabel.textContent = `Масштаб: ${Math.round(this.scale * 100)}%`;
    },

    // Расположение по центру
    getPolygonCenter(points) {
        let x = 0, y = 0;
        for (const p of points) {
            x += p.x;
            y += p.y;
        }
        return {
            x: x / points.length,
            y: y / points.length
        };
    },


    // Перерисовка всего
redrawAll: function() {
    if (!this.ctx) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.baseImage) {
        this.updateZoomLabel();
        return;
    }

    // Рисуем изображение
    const scaledWidth = this.baseImage.width * this.scale;
    const scaledHeight = this.baseImage.height * this.scale;
    this.ctx.drawImage(this.baseImage, 0, 0, this.baseImage.width, this.baseImage.height,
                       0, 0, scaledWidth, scaledHeight);

    // Рисуем этаж (границу)
    if (this.floorPoints.length > 0) {
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 4;
        this.ctx.setLineDash([8, 6]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.floorPoints[0].x * this.scale, this.floorPoints[0].y * this.scale);
        for (let i = 1; i < this.floorPoints.length; i++) {
            this.ctx.lineTo(this.floorPoints[i].x * this.scale, this.floorPoints[i].y * this.scale);
        }
        if (this.floorReady && this.floorPoints.length >= 3) this.ctx.closePath();
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Рисуем точки этажа
        this.ctx.fillStyle = 'black';
        for (const point of this.floorPoints) {
            this.ctx.beginPath();
            this.ctx.arc(point.x * this.scale, point.y * this.scale, 5, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    // Рисуем комнаты
    if (this.floorReady) {
        for (let idx = 0; idx < this.rooms.length; idx++) {
            const room = this.rooms[idx];
            const pts = room.points;
            if (pts.length < 3) continue;

            const fillColor = room.color || this.roomTypes[room.type] || "#AAAAAA";
            this.ctx.strokeStyle = (idx === this.selectedRoomIndex) ? 'black' : 'red';
            this.ctx.lineWidth = (idx === this.selectedRoomIndex) ? 5 : 2;
            this.ctx.fillStyle = fillColor;

            // Рисуем полигон
            this.ctx.beginPath();
            this.ctx.moveTo(pts[0].x * this.scale, pts[0].y * this.scale);
            for (let i = 1; i < pts.length; i++) {
                this.ctx.lineTo(pts[i].x * this.scale, pts[i].y * this.scale);
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();

            // Название комнаты
            const center = this.getPolygonCenter(pts);
            this.ctx.save();
            this.ctx.font = `${14 * this.scale}px Arial`;
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            const text = room.name;
            const metrics = this.ctx.measureText(text);
            const padding = 4 * this.scale;

            this.ctx.fillStyle = "rgba(255,255,255,0.7)";
            this.ctx.fillRect(center.x * this.scale - metrics.width / 2 - padding,
                              center.y * this.scale - 8 * this.scale,
                              metrics.width + padding * 2,
                              16 * this.scale);
            this.ctx.fillStyle = "#000";
            this.ctx.fillText(text, center.x * this.scale, center.y * this.scale);
            this.ctx.restore();

            // Рисуем вершины
            for (const point of pts) {
                const radius = (idx === this.selectedRoomIndex) ? 5 : 3;
                this.ctx.fillStyle = (idx === this.selectedRoomIndex) ? 'black' : 'red';
                this.ctx.beginPath();
                this.ctx.arc(point.x * this.scale, point.y * this.scale, radius, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
    }

    // Текущий рисуемый контур комнаты (синий)
    if (this.mode === "room" && this.roomPoints.length > 0) {
        this.ctx.strokeStyle = 'blue';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(this.roomPoints[0].x * this.scale, this.roomPoints[0].y * this.scale);
        for (let i = 1; i < this.roomPoints.length; i++) {
            this.ctx.lineTo(this.roomPoints[i].x * this.scale, this.roomPoints[i].y * this.scale);
        }
        this.ctx.stroke();

        this.ctx.fillStyle = 'blue';
        for (const point of this.roomPoints) {
            this.ctx.beginPath();
            this.ctx.arc(point.x * this.scale, point.y * this.scale, 3, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    // Обновление zoom
    this.updateZoomLabel();

    // Отображение типа комнаты при наведении
   

}

};

// Инициализация приложения при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});


