import argparse
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3


def rewrite_paths(value, original, destination):
    if isinstance(value, str):
        if value.lower().startswith(str(original).lower()):
            return str(destination) + value[len(str(original)):]
        return value
    if isinstance(value, dict):
        return {key: rewrite_paths(entry, original, destination) for key, entry in value.items()}
    if isinstance(value, list):
        return [rewrite_paths(entry, original, destination) for entry in value]
    return value


def migrate(profile=None):
    roaming = Path(os.environ['APPDATA'])
    identifier = 'com.cartermedia.app'
    if profile:
        if not re.fullmatch(r'[A-Za-z0-9_-]+', profile):
            raise ValueError('Invalid profile name')
        identifier += '.profile.' + profile
    destination = roaming / identifier
    destination.mkdir(parents=True, exist_ok=True)
    original = roaming / 'com.nuclearplayer'
    music_imported = False
    if not (destination / 'settings.json').exists():
        for directory in ['plugins', 'playlists', 'themes', 'ytdlp']:
            source = original / directory
            if source.is_dir():
                shutil.copytree(source, destination / directory, dirs_exist_ok=True)
        for source in original.glob('*.json'):
            if source.name == '.window-state.json':
                continue
            data = rewrite_paths(json.loads(source.read_text(encoding='utf-8')), original, destination)
            if source.name == 'settings.json':
                data['core.updates.checkForUpdates'] = False
            (destination / source.name).write_text(json.dumps(data, indent=2), encoding='utf-8')
        if not (destination / 'settings.json').exists():
            (destination / 'settings.json').write_text(json.dumps({
                'core.theme.active.type': 'basic',
                'core.theme.active.id': 'nuclear:ember',
                'core.theme.dark': True,
                'core.updates.checkForUpdates': False,
            }), encoding='utf-8')
        history = original / 'databases' / 'history.db'
        if history.is_file():
            (destination / 'databases').mkdir(exist_ok=True)
            with sqlite3.connect(history.as_uri() + '?mode=ro', uri=True) as source_db:
                with sqlite3.connect(destination / 'databases' / 'history.db') as destination_db:
                    source_db.backup(destination_db)
        music_imported = True
    video = destination / 'video'
    video_imported = False
    if not (video / 'settings.db').exists():
        video.mkdir(exist_ok=True)
        video_source = roaming / 'CarterTube'
        if not (video_source / 'settings.db').exists():
            video_source = roaming / 'FreeTube'
        for name in ['settings', 'history', 'profiles', 'playlists', 'search-history', 'subscription-cache']:
            source = video_source / (name + '.db')
            if source.is_file():
                shutil.copyfile(source, video / source.name)
        with (video / 'settings.db').open('a', encoding='utf-8') as settings:
            settings.write('\n')
            for key, value in [('landingPage', 'home'), ('checkForUpdates', False), ('expandSideBar', True)]:
                settings.write(json.dumps({'_id': key, 'value': value}) + '\n')
        video_imported = True
    return {'profile': str(destination), 'musicImported': music_imported, 'videoImported': video_imported}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--profile')
    arguments = parser.parse_args()
    print(json.dumps(migrate(arguments.profile)))
