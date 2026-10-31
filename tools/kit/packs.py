"""Where each Quaternius pack's models and textures sit once unzipped into art/raw/quaternius.

The packs (unzipped one per folder, see README.md):
  props     Fantasy Props MegaKit[Standard]
  village   Medieval Village MegaKit[Standard]
  nature    Stylized Nature MegaKit[Standard]
  trees     Textured Stylized Trees - May 2020
  ultimate  Ultimate Nature Pack by Quaternius
  dungeon   Updated Modular Dungeon - May 2019
"""
import glob
import os

MODELS = {
    'props': ('props/Exports/glTF', '.gltf'),
    'village': ('village/Medieval Village MegaKit[Standard]/glTF', '.gltf'),
    'nature': ('nature/glTF', '.gltf'),
    'trees': ('trees/Textured Stylized Trees - May 2020/FBX', '.fbx'),
    'ultimate': ('ultimate/FBX', '.fbx'),
    'dungeon': ('dungeon/.Updated Modular Dungeon - May 2019/FBX', '.fbx'),
}
TEXTURES = {
    'props': 'props/Textures',
    'village': 'village/Medieval Village MegaKit[Standard]/Textures',
    'nature': 'nature/Textures',
    'trees': 'trees/Textured Stylized Trees - May 2020/Textures',
}


def sources(raw):
    """(pack, model name, path) for every model in every pack, in a fixed order."""
    for pack, (sub, ext) in MODELS.items():
        for path in sorted(glob.glob(os.path.join(glob.escape(os.path.join(raw, sub)), '*' + ext))):
            name = os.path.splitext(os.path.basename(path))[0]
            yield pack, name, path


def texture_dir(raw, pack):
    return os.path.join(raw, TEXTURES[pack]) if pack in TEXTURES else None
