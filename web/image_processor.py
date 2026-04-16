import os
import uuid
import shutil


class ImageProcessor:
    @staticmethod
    def process_and_copy_images(file_paths, current_project_name, base_dir="projects"):
        """
        Копирует выбранные картинки в папку проекта и генерирует для них данные.
        """
        # Путь к папке images внутри активного проекта
        project_images_dir = os.path.join(base_dir, current_project_name, "images")

        if not os.path.exists(project_images_dir):
            os.makedirs(project_images_dir)

        new_objects_data = {}

        for original_path in file_paths:
            if not os.path.exists(original_path):
                continue  # Защита от битых путей

            # Достаем имя файла и его расширение (например, .png или .jpg)
            filename = os.path.basename(original_path)
            name_without_ext, ext = os.path.splitext(filename)

            # Генерируем уникальный ID для объекта и файла
            unique_id = f"obj_{uuid.uuid4().hex[:8]}"
            unique_filename = f"{unique_id}{ext}"

            # Абсолютный путь куда копируем
            dest_path = os.path.join(project_images_dir, unique_filename)

            # Физически копируем файл
            shutil.copy(original_path, dest_path)

            # Формируем структуру данных.
            # ВАЖНО: сохраняем ОТНОСИТЕЛЬНЫЙ путь, чтобы проект можно было переносить
            new_objects_data[unique_id] = {
                "name": name_without_ext,  # По умолчанию берем имя исходного файла
                "image_path": f"images/{unique_filename}",
                "level": None,  # Пока картинка не перетащена, она ни на каком уровне
                "position": 0
            }

        return new_objects_data
