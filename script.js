let currentProjectName = "";

window.onload = async function() {
    await loadProjectsList();
};

async function loadProjectsList() {
    const grid = document.getElementById('projects-grid');
    grid.innerHTML = '<p class="text-gray-500 col-span-full">Загрузка проектов...</p>';

    let projects = await eel.get_all_projects()();
    grid.innerHTML = '';

    if (projects.length === 0) {
        grid.innerHTML = '<p class="text-gray-500 col-span-full">У вас пока нет проектов. Создайте первый!</p>';
        return;
    }

    projects.forEach(projectName => {
        const card = document.createElement('div');
        // Добавлены классы relative и group для позиционирования и скрытия кнопки крестика
        card.className = 'bg-gray-800 p-6 rounded-lg cursor-pointer border border-transparent hover:border-indigo-500 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 relative group';
        card.onclick = () => openProject(projectName);

        card.innerHTML = `
            <button onclick="event.stopPropagation(); deleteEntireProject('${projectName}')" class="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10" title="Удалить проект">
                &times;
            </button>

            <h3 class="text-lg font-bold mb-2 truncate pr-8" title="${projectName}">${projectName}</h3>
            <p class="text-gray-400 text-sm">Нажмите, чтобы редактировать</p>
        `;
        grid.appendChild(card);
    });
}

async function createNewProject() {
    const input = document.getElementById('new-project-name');
    const projectName = input.value.trim();

    if (!projectName) {
        alert("Пожалуйста, введите название проекта!");
        return;
    }

    let success = await eel.create_project(projectName)();

    if (success) {
        input.value = '';
        await loadProjectsList();
        openProject(projectName);
    } else {
        alert("Проект с таким именем уже существует!");
    }
}

async function importProject() {
    let result = await eel.import_project_zip()();

    if (result.status === "success") {
        await loadProjectsList(); // Перезагружаем список
        // Предлагаем сразу открыть импортированный проект
        if (confirm(`Проект "${result.name}" успешно импортирован! Открыть его сейчас?`)) {
            openProject(result.name);
        }
    } else if (result.status === "error") {
        alert(`Ошибка импорта:\n${result.message}`);
    }
}

async function deleteEntireProject(projectName) {
    if (confirm(`Вы уверены, что хотите БЕЗВОЗВРАТНО удалить проект "${projectName}" и все загруженные в него картинки?`)) {

        let success = await eel.delete_project(projectName)();

        if (success) {
            await loadProjectsList();
        } else {
            alert("Не удалось удалить проект. Возможно, файлы используются другой программой.");
        }
    }
}

async function openProject(projectName) {
    currentProjectName = projectName;
    let data = await eel.load_project_data(projectName)();

    if (data) {
        document.getElementById('current-project-title').innerText = projectName;

        const container = document.getElementById('tier-list-container');
        const addBtn = document.getElementById('add-tier-btn');

        // 1. Очищаем старые ряды (кроме кнопки добавления)
        container.querySelectorAll('.flex.bg-gray-800').forEach(el => el.remove());

        // 2. Отрисовываем тиры из базы данных
        for (let tierId in data.levels) {
            const tierRow = createTierRowElement(tierId, data.levels[tierId]);
            container.insertBefore(tierRow, addBtn);

            // Инициализируем Sortable для каждого нового ряда
            new Sortable(tierRow.querySelector('.sortable-list'), {
                group: 'shared-tier-list',
                animation: 200,
                onEnd: saveCurrentLayout
            });
        }

        // 3. Распределяем объекты (как и раньше)
        const pool = document.getElementById('unsorted-pool');
        pool.innerHTML = '';

        Object.entries(data.objects).sort((a,b) => a[1].position - b[1].position).forEach(([objId, item]) => {
            const imgElement = createImageElement(objId, item);
            const targetList = document.getElementById(item.level);
            if (item.level && targetList) {
                targetList.appendChild(imgElement);
            } else {
                pool.appendChild(imgElement);
            }
        });

        document.getElementById('main-menu').classList.replace('block', 'hidden');
        document.getElementById('editor-screen').classList.replace('hidden', 'block');
    }
}

function showMainMenu() {
    // Скрываем редактор, показываем меню
    document.getElementById('editor-screen').classList.replace('block', 'hidden');
    document.getElementById('main-menu').classList.replace('hidden', 'block');

    loadProjectsList();
}

let currentProjectData = null;
let sortableInstances = [];

// --- ЛОГИКА РЕДАКТОРА (SORTABLE JS) ---

// Функция активации Drag-and-Drop
function initDragAndDrop() {
    const containers = document.querySelectorAll('.sortable-list');

    containers.forEach(container => {
        new Sortable(container, {
            group: 'shared-tier-list',
            animation: 200,
            ghostClass: 'opacity-20',
            chosenClass: 'border-indigo-500',
            onEnd: function (evt) {
                // Вызываем автосохранение каждый раз, когда отпускаем картинку
                saveCurrentLayout();
            }
        });
    });
}

async function saveCurrentLayout() {
    if (!currentProjectName) return;

    let layoutData = {};

    // Проходимся по всем спискам (и тирам, и подвалу)
    const lists = document.querySelectorAll('.sortable-list');
    lists.forEach(list => {
        // Если это подвал, считаем уровень null
        const levelId = list.id === 'unsorted-pool' ? null : list.id;

        // Собираем все картинки внутри этого списка
        // Мы ищем по классу 'group', который мы давали карточкам картинок
        const items = list.querySelectorAll('.group');
        items.forEach((item, index) => {
            layoutData[item.id] = {
                level: levelId,
                position: index // Порядок следования внутри ряда
            };
        });
    });

    // Отправляем данные в Python для записи в JSON
    await eel.update_objects_layout(currentProjectName, layoutData)();
    console.log("Прогресс сохранен!");
}

document.addEventListener("DOMContentLoaded", initDragAndDrop);

async function uploadRealImages() {
    let newItems = await eel.ask_and_upload_images()();
    if (!newItems || newItems.error) return;

    const emptyText = document.getElementById('empty-pool-text');
    if (emptyText) emptyText.style.display = 'none';

    const pool = document.getElementById('unsorted-pool');

    for (let objId in newItems) {
        const imgElement = createImageElement(objId, newItems[objId]);
        pool.appendChild(imgElement);
    }

    // Сразу сохраняем изменения на диск
    saveCurrentLayout();
}

let currentEditingTier = null;
let currentSelectedColor = '';
let tierCounter = 5; // Начинаем с 5, так как 4 тира уже есть

function openTierModal(btnElement) {
    currentEditingTier = btnElement.closest('.flex.bg-gray-800.rounded-lg');

    const labelDiv = currentEditingTier.querySelector('.w-24, .w-32');
    const title = labelDiv.innerText;

    const classes = Array.from(labelDiv.classList);
    const colorClass = classes.find(c => c.startsWith('bg-') && c !== 'bg-gray-800' && c !== 'bg-gray-900');

    document.getElementById('tier-title-input').value = title;
    selectColor(colorClass || 'bg-gray-400');

    document.getElementById('tier-modal').classList.remove('hidden');
}

// Выбор цвета в модальном окне
function selectColor(colorClass) {
    currentSelectedColor = colorClass;
    const buttons = document.querySelectorAll('#color-picker button');

    // Подсвечиваем выбранный цвет белой рамкой
    buttons.forEach(btn => {
        if(btn.classList.contains(colorClass)) {
            btn.classList.replace('border-transparent', 'border-white');
        } else {
            btn.classList.replace('border-white', 'border-transparent');
        }
    });
}

// Закрытие окна
function closeTierModal() {
    document.getElementById('tier-modal').classList.add('hidden');
    currentEditingTier = null;
}

async function saveTierSettings() {
    if (!currentEditingTier) return;

    const newName = document.getElementById('tier-title-input').value.trim() || '?';
    const tierId = currentEditingTier.querySelector('.sortable-list').id;

    // Обновляем UI (как и раньше)
    const labelDiv = currentEditingTier.querySelector('.w-24, .w-32');
    labelDiv.innerText = newName;

    const classes = Array.from(labelDiv.classList);
    classes.forEach(c => {
        if (c.startsWith('bg-') && c !== 'bg-gray-800' && c !== 'bg-gray-900') {
            labelDiv.classList.remove(c);
        }
    });
    labelDiv.classList.add(currentSelectedColor);

    // СОХРАНЯЕМ В PYTHON
    await eel.update_tier_info(currentProjectName, tierId, newName, currentSelectedColor)();

    closeTierModal();
}

async function deleteTier() {
    if (!currentEditingTier) return;

    if (confirm('Удалить этот ряд?')) {
        const tierId = currentEditingTier.querySelector('.sortable-list').id;

        // Возвращаем картинки в пул
        const list = currentEditingTier.querySelector('.sortable-list');
        const pool = document.getElementById('unsorted-pool');
        while (list.firstChild) pool.appendChild(list.firstChild);

        // Удаляем из UI
        currentEditingTier.remove();

        // УДАЛЯЕМ ИЗ PYTHON
        await eel.remove_tier_from_data(currentProjectName, tierId)();

        saveCurrentLayout();
        closeTierModal();
    }
}

// Добавление нового ряда
function addNewTier() {
    const container = document.getElementById('tier-list-container');
    const addBtn = document.getElementById('add-tier-btn');

    // Создаем HTML нового ряда. Добавлен min-h-[100px] и shrink-0
    const tierRow = document.createElement('div');
    tierRow.className = 'flex bg-gray-800 rounded-lg overflow-hidden border border-gray-700 shadow-sm min-h-[100px] shrink-0';

    const tierId = `tier-${tierCounter++}`;

    tierRow.innerHTML = `
        <div class="w-24 md:w-32 flex items-center justify-center font-black text-3xl text-gray-900 ${color} shrink-0 select-none">${name}</div>
        <div class="flex-1 p-2 flex flex-wrap gap-2 sortable-list" id="${tierId}"></div>
        <div data-html2canvas-ignore="true" class="w-12 bg-gray-900 flex items-center justify-center cursor-pointer hover:bg-gray-700 text-gray-500 transition-colors shrink-0" onclick="openTierModal(this)">⚙️</div>
    `;

    // Вставляем перед кнопкой "Добавить ряд"
    container.insertBefore(tierRow, addBtn);

    // ВАЖНО: Активируем SortableJS с ПРАВИЛЬНЫМ именем группы!
    const newList = tierRow.querySelector('.sortable-list');
    new Sortable(newList, {
        group: 'shared-tier-list', // <--- ТЕПЕРЬ ИМЯ СОВПАДАЕТ
        animation: 200,
        ghostClass: 'opacity-20',
        chosenClass: 'border-indigo-500',
        onEnd: function (evt) {
            console.log(`Объект ${evt.item.id} перемещен в ${evt.to.id}`);
            // В будущем здесь будет автосохранение
        }
    });
}

function openImagePreview(imagePath) {
    const modal = document.getElementById('image-preview-modal');
    const img = document.getElementById('preview-image');

    // Подставляем путь к картинке
    img.src = imagePath;

    // Показываем окно (убираем hidden)
    modal.classList.remove('hidden');

    // Небольшая задержка для красивой CSS-анимации появления
    setTimeout(() => {
        modal.classList.replace('opacity-0', 'opacity-100');
        img.classList.replace('scale-95', 'scale-100');
    }, 10);
}

function closeImagePreview() {
    const modal = document.getElementById('image-preview-modal');
    const img = document.getElementById('preview-image');

    // Запускаем анимацию исчезновения
    modal.classList.replace('opacity-100', 'opacity-0');
    img.classList.replace('scale-100', 'scale-95');

    // Прячем элемент полностью после завершения анимации
    setTimeout(() => {
        modal.classList.add('hidden');
        img.src = ''; // Очищаем источник
    }, 300);
}

// Функция-помощник для создания карточки фото
function createImageElement(objId, itemData) {
    const imageBox = document.createElement('div');
    imageBox.className = 'w-24 h-24 bg-gray-700 rounded-md border-2 border-gray-600 flex items-center justify-center cursor-grab hover:border-indigo-400 overflow-hidden relative group shrink-0';
    imageBox.id = objId;

    let webPath = itemData.web_path || `/projects/${currentProjectName}/${itemData.image_path}`;

    // Вешаем открытие превью на саму карточку
    imageBox.setAttribute('onclick', `openImagePreview('${webPath}')`);

    imageBox.innerHTML = `
        <img src="${webPath}" class="w-full h-full object-cover pointer-events-none" alt="${itemData.name}">

        <button onclick="deleteObject('${objId}', event)" class="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 shadow-md" title="Удалить">
            &times;
        </button>

        <div class="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white text-xs text-center truncate px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            ${itemData.name}
        </div>
    `;
    return imageBox;
}

// Функция удаления объекта
async function deleteObject(objId, event) {
    // Останавливаем событие клика, чтобы не открылась модалка увеличения фото!
    event.stopPropagation();

    // Спрашиваем подтверждение, чтобы пользователь не удалил случайно
    if (confirm("Вы уверены, что хотите удалить эту картинку?")) {

        // 1. Сразу убираем элемент с экрана (для мгновенного отклика)
        const element = document.getElementById(objId);
        if (element) {
            element.remove();
        }

        // 2. Даем команду Python удалить файл и обновить JSON
        await eel.delete_object(currentProjectName, objId)();

        // 3. Обновляем порядок остальных элементов
        saveCurrentLayout();

        // 4. Если склад (пул) оказался пустым, возвращаем текст-подсказку
        const pool = document.getElementById('unsorted-pool');
        if (pool.children.length === 0) {
            pool.innerHTML = '<p id="empty-pool-text" class="text-gray-600 text-sm italic w-full text-center mt-10 pointer-events-none">Перетащите сюда изображения или нажмите кнопку выше</p>';
        }
    }
}

function createTierRowElement(tierId, tierData) {
    const tierRow = document.createElement('div');
    tierRow.className = 'flex bg-gray-800 rounded-lg overflow-hidden border border-gray-700 shadow-sm min-h-[100px] shrink-0';

    // Если в данных старая строка, используем дефолтный цвет
    const name = typeof tierData === 'string' ? tierData : tierData.name;
    const color = tierData.color || 'bg-gray-400';

    tierRow.innerHTML = `
        <div class="w-24 md:w-32 flex items-center justify-center font-black text-3xl text-gray-900 ${color} shrink-0 select-none">${name}</div>
        <div class="flex-1 p-2 flex flex-wrap gap-2 sortable-list" id="${tierId}"></div>
        <div class="w-12 bg-gray-900 flex items-center justify-center cursor-pointer hover:bg-gray-700 text-gray-500 transition-colors shrink-0" onclick="openTierModal(this)">⚙️</div>
    `;
    return tierRow;
}

function openExportModal() {
    document.getElementById('export-modal').classList.remove('hidden');
}

function closeExportModal() {
    document.getElementById('export-modal').classList.add('hidden');
}

// --- ЭКСПОРТ В ФОТО (JPEG) ---

// Функция для сохранения фото через Eel (Python)
async function saveImage(dataUrl, filename) {
    // Отрезаем технический заголовок "data:image/jpeg;base64,"
    const base64Data = dataUrl.replace(/^data:image\/(jpeg|png);base64,/, "");

    // Отправляем в Python и ждем результат
    let result = await eel.save_image(currentProjectName, base64Data, filename)();

    if (result.status === "success") {
        // Показываем красивое оповещение с путем сохранения
        alert(`Фото успешно сохранено!\nПуть: ${result.path}`);
    } else if (result.status === "error") {
        // Показываем ошибку
        alert(`Не удалось сохранить фото.\nОшибка: ${result.message}`);
    }
}

// Вызывается при нажатии на карточку "Сохранить как фото"
async function exportToImage() {
    closeExportModal();

    if (!currentProjectName) {
        alert("Проект не выбран!");
        return;
    }

    // Указываем контейнер, который будем фотографировать
    const tierContainer = document.getElementById('tier-list-container');
    const filename = `${currentProjectName}_tierlist.jpg`;

    try {
        // html2canvas автоматически проигнорирует всё, где есть data-html2canvas-ignore="true"
        const canvas = await html2canvas(tierContainer, {
            useCORS: true,
            scale: 2, // Двойное разрешение для четкости
            backgroundColor: '#1a1a24' // Цвет фона (под цвет темной темы)
        });

        const dataUrl = canvas.toDataURL('image/jpeg', 0.9); // Конвертируем в JPEG (90% качество)
        await saveImage(dataUrl, filename); // Отправляем в Python

    } catch (error) {
        console.error("Ошибка при создании фото:", error);
        alert("Не удалось создать фото.");
    }
}

async function exportToFile() {
    closeExportModal();

    if (!currentProjectName) return;

    let result = await eel.export_project_zip(currentProjectName)();

    if (result.status === "success") {
        alert(`Проект успешно упакован в архив!\nПуть: ${result.path}`);
    } else if (result.status === "error") {
        alert(`Не удалось экспортировать проект.\nОшибка: ${result.message}`);
    }
}