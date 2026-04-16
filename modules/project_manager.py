import os
import json
import shutil


class ProjectManager:
    def __init__(self, base_dir="projects"):
        self.base_dir = base_dir
        self.current_project = None
        self.project_data = {}

        # Создаем главную папку проектов, если ее нет
        if not os.path.exists(self.base_dir):
            os.makedirs(self.base_dir)

    def get_projects_list(self):
        """Сканирует директорию и возвращает список названий проектов."""
        return [d for d in os.listdir(self.base_dir)
                if os.path.isdir(os.path.join(self.base_dir, d))]

    def create_project(self, project_name):
        """Создает структуру папок для нового проекта и базовый JSON."""
        project_path = os.path.join(self.base_dir, project_name)
        images_path = os.path.join(project_path, "images")

        if os.path.exists(project_path):
            return False  # Проект с таким именем уже существует

        os.makedirs(project_path)
        os.makedirs(images_path)

        # Задаем дефолтную структуру
        self.project_data = {
            "levels": {"1": "S", "2": "A", "3": "B", "4": "C", "5": "D"},
            "objects": {}
        }
        self.current_project = project_name
        self.save_project()
        return True

    def load_project(self, project_name):
        """Считывает данные проекта в память."""
        json_path = os.path.join(self.base_dir, project_name, "data.json")
        if os.path.exists(json_path):
            with open(json_path, 'r', encoding='utf-8') as f:
                self.project_data = json.load(f)
            self.current_project = project_name
            return True
        return False

    def save_project(self):
        """Сохраняет текущие изменения на диск."""
        if not self.current_project:
            return False

        json_path = os.path.join(self.base_dir, self.current_project, "data.json")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(self.project_data, f, ensure_ascii=False, indent=4)
        return True

    def delete_project(self, project_name):
        """Полностью удаляет папку проекта со всеми файлами внутри."""
        project_path = os.path.join(self.base_dir, project_name)

        if os.path.exists(project_path):
            try:
                # shutil.rmtree удаляет дерево директорий (папку и всё внутри)
                shutil.rmtree(project_path)

                # Если мы удалили проект, который сейчас открыт, сбрасываем его
                if self.current_project == project_name:
                    self.current_project = None
                    self.project_data = {}

                return True
            except Exception as e:
                print(f"Ошибка при удалении проекта {project_name}: {e}")
                return False
        return False
