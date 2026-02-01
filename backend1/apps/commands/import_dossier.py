from django.core.management.base import BaseCommand
from b2b.utils import Classeur1  # Le chemin vers ta fonction import

class Command(BaseCommand):
    help = 'Importe les dossiers et les touristes depuis un fichier Excel'

    def add_arguments(self, parser):
        parser.add_argument('file_path', type=str, help='Le chemin vers le fichier Excel')

    def handle(self, *args, **kwargs):
        file_path = kwargs['file_path']
        import_dossier_from_excel(file_path)
        self.stdout.write(self.style.SUCCESS('Importation terminée !'))
