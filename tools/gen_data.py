#!/usr/bin/env python3
"""Generates src/data/generated.ts from Factorio wiki infobox dumps.

Usage: python3 tools/gen_data.py <wiki_dump_dir>
The dump dir must contain parsed.json (infobox fields) and levels.json
(multi-level research tables), produced by the fetch scripts.
"""
import json, re, sys, os

src = sys.argv[1]
P = json.load(open(os.path.join(src, 'parsed.json')))
LV = json.load(open(os.path.join(src, 'levels.json')))

EXCLUDE = {
    'Alien science pack', 'Curved rail', 'Iron axe', 'Steel axe', 'Filter inserter', 'Stack filter inserter',
    'Smart chest', 'Smart inserter', 'Rocket control unit', 'Rocket defense', 'Wood (archived)',
    'Zippy/workbench', 'Long handed inserter', 'Copper wire', 'Player', 'Uranium-235 recipe',
    'Alien artifact', 'Discharge defense remote', 'Artillery targeting remote',
}
EXCLUDE_TECH = {
    'Advanced chemistry', 'Alien technology', 'Armor crafting', 'Automated construction', 'Chemistry',
    'Iron working', 'Rocket control unit', 'Rocket defense', 'Foundation', 'Lithium processing',
    'Rocket part productivity', 'Steel plate productivity', 'Rail signals', 'Character logistic slots',
    'Character logistic trash slots', 'Auto character logistic trash slots', 'Flight', 'Combat robot damage',
    'Bullet damage', 'Bullet shooting speed', 'Cannon shell damage', 'Cannon shell shooting speed', 'Flamethrower damage',
    'Grenade damage', 'Gun turret damage', 'Laser turret damage', 'Rocket damage', 'Rocket shooting speed',
    'Shotgun shell damage', 'Shotgun shell shooting speed',
}

FLUIDS = ['water', 'steam', 'crude-oil', 'heavy-oil', 'light-oil', 'petroleum-gas', 'lubricant', 'sulfuric-acid']

name2id = {}
for k, v in P.items():
    if v.get('internal-name'):
        name2id[k.lower()] = v['internal-name']
name2id.update({
    'barrel': 'barrel', 'raw fish': 'raw-fish', 'rail': 'rail', 'lamp': 'small-lamp', 'wall': 'stone-wall',
    'wood': 'wood', 'time': 'time', 'space science pack': 'space-science-pack',
    'long-handed inserter': 'long-handed-inserter',
})


def nid(n):
    n = n.strip()
    k = n.lower()
    if k in name2id:
        return name2id[k]
    return re.sub(r'[^a-z0-9]+', '-', k).strip('-')


def parse_list(s):
    out = []
    for part in s.split('+'):
        part = part.strip()
        if not part:
            continue
        m = re.match(r'(.+?),\s*([\d.]+)\s*$', part)
        if m:
            out.append([nid(m.group(1)), float(m.group(2))])
        else:
            out.append([nid(part), 1.0])
    return out


def parse_recipe(s):
    s = re.sub(r'\s+', ' ', s)
    if '=' in s:
        a, b = s.split('=', 1)
    else:
        a, b = s, None
    ing = parse_list(a)
    t = 0.5
    ings = []
    for i, n in ing:
        if i == 'time':
            t = n
        else:
            ings.append([i, n])
    res = parse_list(b) if b else None
    return t, ings, res


def num(v):
    if v is None:
        return None
    m = re.match(r'\{\{Quality\|([^|}]*)', v)
    if m:
        v = m.group(1)
    m = re.search(r'([\d.]+)', v)
    return float(m.group(1)) if m else None


def fuel(v):
    if not v:
        return None
    m = re.match(r'([\d.]+)\s*\{\{Translation\|(MJ|GJ|kJ)', v)
    if not m:
        m = re.match(r'([\d.]+)\s*(MJ|GJ|kJ)', v)
    if not m:
        return None
    mult = {'kJ': 1e3, 'MJ': 1e6, 'GJ': 1e9}[m.group(2)]
    return float(m.group(1)) * mult


items = {}
recipes = {}
techs = {}

for k, v in sorted(P.items()):
    if v.get('space-age') == 'yes' or k in EXCLUDE or k.endswith('(research)'):
        continue
    pt = v.get('prototype-type')
    iid = v.get('internal-name')
    if not iid or pt in (None, 'technology'):
        continue
    if pt == 'fluid':
        continue
    if pt == 'recipe':
        continue
    if pt == 'resource' and iid == 'crude-oil':
        continue
    stack = num(v.get('stack-size'))
    if stack is None:
        continue
    items[iid] = {
        'name': k, 'stack': int(stack), 'ptype': pt, 'wcat': v.get('category'),
    }
    fv = fuel(v.get('fuel-value'))
    if fv:
        items[iid]['fuel'] = fv

# recipes
for k, v in sorted(P.items()):
    if v.get('space-age') == 'yes' or k in EXCLUDE or k.endswith('(research)'):
        continue
    if 'recipe' not in v:
        continue
    iid = v.get('internal-name')
    if not iid or iid in ('uranium-235', 'uranium-238', 'depleted-uranium-fuel-cell'):
        continue
    t, ings, res = parse_recipe(v['recipe'])
    if res is None:
        res = [[iid, 1.0]]
    prod = (v.get('producers') or '').lower()
    hasfluid = any(i in FLUIDS for i, _ in ings + res)
    if 'furnace' in prod:
        cat = 'smelting'
    elif 'chemical plant' in prod:
        cat = 'chemistry'
    elif 'centrifuge' in prod:
        cat = 'centrifuging'
    elif 'rocket silo' in prod:
        cat = 'rocket-building'
    elif 'oil refinery' in prod:
        cat = 'oil-processing'
    elif hasfluid:
        cat = 'crafting-with-fluid'
    elif 'player' in prod:
        cat = 'crafting'
    else:
        cat = 'advanced-crafting'
    req = v.get('required-technologies')
    recipes[iid] = {
        'name': k, 'time': t, 'ing': ings, 'res': res, 'cat': cat,
    }

# manual recipes
def R(rid, name, t, ing, res, cat):
    recipes[rid] = {'name': name, 'time': t, 'ing': ing, 'res': res, 'cat': cat}

R('basic-oil-processing', 'Basic oil processing', 5, [['crude-oil', 100]], [['petroleum-gas', 45]], 'oil-processing')
R('advanced-oil-processing', 'Advanced oil processing', 5, [['crude-oil', 100], ['water', 50]],
  [['heavy-oil', 25], ['light-oil', 45], ['petroleum-gas', 55]], 'oil-processing')
R('coal-liquefaction', 'Coal liquefaction', 5, [['coal', 10], ['heavy-oil', 25], ['steam', 50]],
  [['heavy-oil', 90], ['light-oil', 20], ['petroleum-gas', 10]], 'oil-processing')
R('heavy-oil-cracking', 'Heavy oil cracking to light oil', 2, [['heavy-oil', 40], ['water', 30]], [['light-oil', 30]], 'chemistry')
R('light-oil-cracking', 'Light oil cracking to petroleum gas', 2, [['light-oil', 30], ['water', 30]], [['petroleum-gas', 20]], 'chemistry')
R('solid-fuel-from-light-oil', 'Solid fuel from light oil', 1, [['light-oil', 10]], [['solid-fuel', 1]], 'chemistry')
R('solid-fuel-from-petroleum-gas', 'Solid fuel from petroleum gas', 1, [['petroleum-gas', 20]], [['solid-fuel', 1]], 'chemistry')
R('solid-fuel-from-heavy-oil', 'Solid fuel from heavy oil', 1, [['heavy-oil', 20]], [['solid-fuel', 1]], 'chemistry')
R('barrel', 'Barrel', 1, [['steel-plate', 1]], [['barrel', 1]], 'crafting')
items['barrel'] = {'name': 'Barrel', 'stack': 10, 'ptype': 'item', 'wcat': 'Intermediate products'}
FNAMES = {'water': 'Water', 'crude-oil': 'Crude oil', 'heavy-oil': 'Heavy oil', 'light-oil': 'Light oil',
          'petroleum-gas': 'Petroleum gas', 'lubricant': 'Lubricant', 'sulfuric-acid': 'Sulfuric acid'}
for f, fn in FNAMES.items():
    bid = f + '-barrel'
    items[bid] = {'name': fn + ' barrel', 'stack': 10, 'ptype': 'item', 'wcat': 'Intermediate products', 'barrelOf': f}
    R(bid, 'Fill ' + fn.lower() + ' barrel', 0.2, [['barrel', 1], [f, 50]], [[bid, 1]], 'crafting-with-fluid')
    R('empty-' + bid, 'Empty ' + fn.lower() + ' barrel', 0.2, [[bid, 1]], [['barrel', 1], [f, 50]], 'crafting-with-fluid')

# fix-ups
recipes['rocket-part']['cat'] = 'rocket-building'
recipes['nuclear-fuel']['cat'] = 'centrifuging'

# technologies
level_tables = {k[:-len(' (research)')]: v for k, v in LV.items()}
for k, v in sorted(P.items()):
    if not k.endswith('(research)'):
        continue
    base = k[:-len(' (research)')]
    if v.get('space-age') == 'yes' or base in EXCLUDE_TECH:
        continue
    iid = v.get('internal-name')
    if not iid:
        continue
    iid = re.sub(r'-1$', '', iid)
    t = {'name': base}
    if v.get('cost'):
        tm, packs, _ = parse_recipe(v['cost'])
        t['time'] = tm
        t['packs'] = [p for p, _ in packs]
        t['count'] = int(num(v.get('cost-multiplier')) or 1)
    if v.get('technology-trigger'):
        tr = v['technology-trigger']
        m = re.match(r'\s*([a-z\-]+):\s*(.+?)(?:,\s*(\d+))?\s*$', tr)
        t['trigger'] = {'type': m.group(1), 'target': nid(m.group(2)), 'count': int(m.group(3) or 1)}
    prereq = []
    for p in (v.get('required-technologies') or '').split('+'):
        p = p.strip()
        if not p:
            continue
        p = re.sub(r',\s*\d+$', '', p).strip()
        prereq.append(p)
    t['prereq'] = prereq
    eff = []
    for e in (v.get('effects') or '').split('+'):
        e = e.strip()
        if e:
            eff.append(e)
    t['unlockNames'] = eff
    if base in level_tables and level_tables[base]:
        lv = []
        for row in level_tables[base]:
            lv.append({'level': row['level'].replace('-&infin;', '+'), 'time': row['time'] or 60, 'packs': row['packs'],
                       'count': row['count'], 'formula': row['formula']})
        t['levels'] = lv
    techs[base] = t

# resolve tech names -> ids
tname2id = {}
for base, t in techs.items():
    tname2id[base.lower()] = re.sub(r'[^a-z0-9]+', '-', base.lower()).strip('-')
out_techs = {}
recipe_by_name = {}
for rid, r in recipes.items():
    recipe_by_name[r['name'].lower()] = rid
for iid, it in items.items():
    if iid in recipes:
        recipe_by_name.setdefault(it['name'].lower(), iid)
extra_names = {
    'heavy oil cracking': 'heavy-oil-cracking', 'light oil cracking': 'light-oil-cracking', 'lamp': 'small-lamp',
    'wall': 'stone-wall',
}
for base, t in techs.items():
    tid = tname2id[base.lower()]
    unlocks = []
    for e in t.pop('unlockNames'):
        k = e.lower()
        rid = extra_names.get(k) or recipe_by_name.get(k)
        if rid is None:
            if 'barrel' in k:
                continue
            print('WARN unresolved unlock', base, e, file=sys.stderr)
            continue
        unlocks.append(rid)
    if base == 'Fluid handling':
        unlocks = ['storage-tank', 'pump', 'barrel'] + [f + '-barrel' for f in FNAMES] + ['empty-' + f + '-barrel' for f in FNAMES]
    t['unlocks'] = list(dict.fromkeys(unlocks))
    pre = []
    for p in t.pop('prereq'):
        pid = tname2id.get(p.lower())
        if pid is None:
            print('WARN unresolved prereq', base, p, file=sys.stderr)
            continue
        pre.append(pid)
    t['prereq'] = pre
    out_techs[tid] = t

# Which recipes are enabled at start: those not unlocked by any tech
unlocked = set()
for t in out_techs.values():
    unlocked.update(t['unlocks'])
for rid, r in recipes.items():
    if rid not in unlocked:
        r['enabled'] = True

with open('src/data/generated.ts', 'w') as f:
    f.write('// AUTO-GENERATED by tools/gen_data.py from wiki infobox data. Do not edit by hand.\n')
    f.write('/* eslint-disable */\n')
    f.write('export const GEN_ITEMS: Record<string, any> = ' + json.dumps(items, indent=0) + ';\n')
    f.write('export const GEN_RECIPES: Record<string, any> = ' + json.dumps(recipes, indent=0) + ';\n')
    f.write('export const GEN_TECHS: Record<string, any> = ' + json.dumps(out_techs, indent=0) + ';\n')
print(len(items), 'items', len(recipes), 'recipes', len(out_techs), 'techs')
