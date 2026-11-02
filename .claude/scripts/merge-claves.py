"""Mete o actualiza claves en un grupo de messages/{es,en}.json, ordenado.

Cada entrada es `clave: (castellano, inglés)`. Vive en el repo porque el
trabajo de traducción vuelve cada vez que se agrega una pantalla.
"""
import json, io, collections

def merge(grupo, pares):
    for idx, lang in ((0, 'es'), (1, 'en')):
        ruta = 'messages/%s.json' % lang
        d = json.load(open(ruta), object_pairs_hook=collections.OrderedDict)
        g = d.get(grupo) or collections.OrderedDict()
        for k, v in pares.items():
            g[k] = v[idx]
        d[grupo] = collections.OrderedDict(sorted(g.items()))
        io.open(ruta, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
    return len(pares)
