import eel, os, base64, shutil, zipfile, bottle
from modules.project_manager import ProjectManager
from modules.image_processor import ImageProcessor

# Инициализируем менеджер проектов
manager = ProjectManager()
eel.init('web')

@bottle.route('/projects/<filepath:path>')
def serve_projects(filepath):
    # Превращаем относительный путь папки в абсолютный, чтобы сервер точно её нашел
    projects_abs_path = os.path.abspath(manager.base_dir)
    return bottle.static_file(filepath, root=projects_abs_path)

@eel.expose
def get_all_projects():
    """Возвращает список папок-проектов."""
    return manager.get_projects_list()

@eel.expose
def create_project(name):
    """Создает новый проект через наш модуль."""
    return manager.create_project(name)

@eel.expose
def delete_project(project_name):
    """Вызывает удаление проекта через менеджер."""
    return manager.delete_project(project_name)

@eel.expose
def update_objects_layout(project_name, layout_data):
    """Обновляет уровни и позиции объектов после перетаскивания."""
    # Убеждаемся, что работаем с нужным проектом
    if manager.load_project(project_name):
        # layout_data выглядит так: {"obj_123": {"level": "tier-s", "position": 0}, ...}
        for obj_id, info in layout_data.items():
            if obj_id in manager.project_data["objects"]:
                manager.project_data["objects"][obj_id]["level"] = info["level"]
                manager.project_data["objects"][obj_id]["position"] = info["position"]

        manager.save_project()
        return True
    return False

@eel.expose
def load_project_data(name):
    """Загружает данные конкретного тир-листа."""
    if manager.load_project(name):
        return manager.project_data
    return None

@eel.expose
def delete_object(project_name, obj_id):
    """Удаляет объект из базы данных и удаляет сам файл картинки."""
    if manager.load_project(project_name):
        if obj_id in manager.project_data["objects"]:
            # 1. Формируем путь к файлу и пытаемся его физически удалить
            img_relative_path = manager.project_data["objects"][obj_id]["image_path"]
            img_full_path = os.path.join(manager.base_dir, project_name, img_relative_path)

            if os.path.exists(img_full_path):
                try:
                    os.remove(img_full_path)
                except Exception as e:
                    print(f"Не удалось удалить файл {img_full_path}: {e}")

            # 2. Удаляем из словаря данных
            del manager.project_data["objects"][obj_id]
            manager.save_project()
            return True
    return False

@eel.expose
def update_tier_info(project_name, tier_id, name, color):
    """Обновляет название и цвет конкретного тира в JSON."""
    if manager.load_project(project_name):
        # Сохраняем информацию в новом формате (объект вместо строки)
        manager.project_data["levels"][tier_id] = {
            "name": name,
            "color": color
        }
        manager.save_project()
        return True
    return False

@eel.expose
def remove_tier_from_data(project_name, tier_id):
    """Удаляет тир из базы данных при его удалении в интерфейсе."""
    if manager.load_project(project_name):
        if tier_id in manager.project_data["levels"]:
            del manager.project_data["levels"][tier_id]
            manager.save_project()
            return True
    return False

@eel.expose
def export_project_zip(project_name):
    """Упаковывает папку проекта в ZIP-архив и сохраняет по выбору пользователя."""
    if not manager.load_project(project_name):
        return {"status": "error", "message": "Проект не найден."}

    project_path = os.path.join(manager.base_dir, project_name)

    # Окно сохранения файла
    root = tk.Tk()
    root.attributes('-topmost', True)
    root.withdraw()

    save_path = filedialog.asksaveasfilename(
        title="Экспорт проекта в ZIP",
        initialfile=f"{project_name}.zip",
        defaultextension=".zip",
        filetypes=[("ZIP Archive", "*.zip")]
    )

    if not save_path:
        return {"status": "cancelled"}

    try:
        # shutil.make_archive добавляет .zip сам, поэтому убираем расширение, если оно есть
        base_name = save_path
        if base_name.endswith('.zip'):
            base_name = base_name[:-4]

        shutil.make_archive(base_name, 'zip', project_path)
        return {"status": "success", "path": save_path}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def import_project_zip():
    """Открывает диалог выбора ZIP, распаковывает в проекты и решает конфликты имен."""
    root = tk.Tk()
    root.attributes('-topmost', True)
    root.withdraw()

    file_path = filedialog.askopenfilename(
        title="Выберите ZIP архив проекта",
        filetypes=[("ZIP Archive", "*.zip")]
    )

    if not file_path:
        return {"status": "cancelled"}

    try:
        # Берем имя файла без .zip как базовое имя проекта
        base_name = os.path.basename(file_path)
        if base_name.endswith('.zip'):
            project_name = base_name[:-4]
        else:
            project_name = "Imported_Project"

        # Логика решения конфликтов (добавление (1), (2) и т.д.)
        final_name = project_name
        counter = 1
        while os.path.exists(os.path.join(manager.base_dir, final_name)):
            final_name = f"{project_name}({counter})"
            counter += 1

        # Создаем папку и распаковываем
        extract_path = os.path.join(manager.base_dir, final_name)
        os.makedirs(extract_path)

        with zipfile.ZipFile(file_path, 'r') as zip_ref:
            zip_ref.extractall(extract_path)

        # Проверяем, действительно ли это проект (есть ли data.json)
        if not os.path.exists(os.path.join(extract_path, "data.json")):
            shutil.rmtree(extract_path)  # Удаляем мусор
            return {"status": "error", "message": "Это не файл проекта Tier List Creator (отсутствует data.json)."}

        return {"status": "success", "name": final_name}
    except Exception as e:
        return {"status": "error", "message": str(e)}

import tkinter as tk
from tkinter import filedialog

@eel.expose
def ask_and_upload_images():
    """Открывает диалог выбора файлов и загружает их в проект."""
    if not manager.current_project:
        return {"error": "Проект не выбран"}

    # Создаем скрытое окно tkinter
    root = tk.Tk()
    root.attributes('-topmost', True)  # Чтобы окно появилось поверх браузера
    root.withdraw()

    # Открываем диалог мультивыбора
    file_paths = filedialog.askopenfilenames(
        title="Выберите изображения для тир-листа",
        filetypes=[("Image files", "*.jpg *.jpeg *.png *.gif *.webp")]
    )

    if not file_paths:
        return None  # Пользователь закрыл окно или нажал Отмена

    # Копируем картинки через наш готовый процессор
    new_items = ImageProcessor.process_and_copy_images(file_paths, manager.current_project)

    # Обновляем базу данных проекта
    manager.project_data["objects"].update(new_items)
    manager.save_project()

    # Возвращаем новые данные в JavaScript, добавляя правильный путь для веба
    # Путь для веба должен начинаться с projects/ИмяПроекта/...
    web_ready_items = {}
    for obj_id, data in new_items.items():
        web_ready_items[obj_id] = data
        web_ready_items[obj_id]["web_path"] = f"projects/{manager.current_project}/{data['image_path']}"

    return web_ready_items


@eel.expose
def save_image(project_name, base64_data, default_filename):
    """Открывает диалог 'Сохранить как...' и записывает JPEG."""

    # Создаем скрытое окно поверх браузера
    root = tk.Tk()
    root.attributes('-topmost', True)
    root.withdraw()

    # Открываем системное окно выбора пути для сохранения
    save_path = filedialog.asksaveasfilename(
        title="Сохранить тир-лист как...",
        initialfile=default_filename,
        defaultextension=".jpg",
        filetypes=[("JPEG Image", "*.jpg"), ("PNG Image", "*.png"), ("All Files", "*.*")]
    )

    # Если пользователь передумал и нажал "Отмена"
    if not save_path:
        return {"status": "cancelled"}

    try:
        # Расшифровываем картинку и сохраняем по выбранному пути
        image_bytes = base64.b64decode(base64_data)
        with open(save_path, 'wb') as f:
            f.write(image_bytes)

        print(f"Успех! Изображение сохранено по пути: {save_path}")
        return {"status": "success", "path": save_path}

    except Exception as e:
        print(f"Ошибка при сохранении изображения: {e}")
        return {"status": "error", "message": str(e)}

# Запуск приложения
eel.start('index.html', size=(1200, 800))