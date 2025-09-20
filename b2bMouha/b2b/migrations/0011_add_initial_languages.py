from django.db import migrations

def create_initial_languages(apps, schema_editor):
    LanguageMapping = apps.get_model('b2b', 'LanguageMapping')
    initial_data = [
        {
            'code': 'fr',
            'name': 'Français',
            'ville': ['Ville'],
            'pays': ['Pays', 'PROVENANCE'],
            'reference': ['Reference', 'REF'],
            'type_da': ['D/A'],
            'nom_reservation': ['Nom réservation', 'Titular'],
            'horaire': ['Horaire'],
        },
        {
            'code': 'es',
            'name': 'Español',
            'ville': ['Ciudad'],
            'pays': ['Org'],
            'reference': ['Ntra.Ref', 'Ref.T.O.'],
            'type_da': ['Tipo', 'Tipo_Vuelo'],
            'nom_reservation': ['Titular'],
            'horaire': ['Hora'],
        },
        {
            'code': 'en',
            'name': 'English',
            'ville': ['City'],
            'pays': ['Country'],
            'reference': ['Reference'],
            'type_da': ['FlightType'],
            'nom_reservation': ['BookingName'],
            'horaire': ['Time'],
        },
        {
            'code': 'it',
            'name': 'Italiano',
            'ville': ['Città'],
            'pays': ['Paese'],
            'reference': ['Rif'],
            'type_da': ['Tipo'],
            'nom_reservation': ['Intestatario'],
            'horaire': ['Orario'],
        },
        {
            'code': 'de',
            'name': 'Deutsch',
            'ville': ['Stadt'],
            'pays': ['Land', 'Herkunft'],
            'reference': ['Referenz', 'Buchungsnummer'],
            'type_da': ['Flugtyp'],
            'nom_reservation': ['Buchungsname', 'Reservierungsname'],
            'horaire': ['Uhrzeit'],
        },
        {
            'code': 'ru',
            'name': 'Русский',
            'ville': ['Город'],
            'pays': ['Страна'],
            'reference': ['Референс', 'Номер брони'],
            'type_da': ['Тип рейса'],
            'nom_reservation': ['Имя бронирования'],
            'horaire': ['Время'],
        },
        {
            'code': 'zh',
            'name': '中文',
            'ville': ['城市'],
            'pays': ['国家'],
            'reference': ['参考号'],
            'type_da': ['航班类型'],
            'nom_reservation': ['预订姓名'],
            'horaire': ['时间'],
        },
    ]
    for lang in initial_data:
        LanguageMapping.objects.update_or_create(code=lang['code'], defaults=lang)

class Migration(migrations.Migration):
    dependencies = [
        ('b2b', '0010_alter_hotel_adresse'),  # La précédente migration
    ]
    operations = [
        migrations.RunPython(create_initial_languages),
    ]
