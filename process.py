import sys
import subprocess


with open('/usr/share/zoneinfo/tzdata.zi', 'r') as handle:
    zonelinks = handle.readlines()
    zonelinks = [x.strip().split(' ')[1:] for x in zonelinks if x.startswith('L ')]
    zonelinks = {v: k for (k, v) in zonelinks}

cache = {}


for line in sys.stdin.readlines():
    (ts, tz) = line.strip().split('\t')
    if tz in zonelinks:
        tz = zonelinks[tz]

    if tz not in cache:
        cache[tz] = subprocess.check_output(['grep', tz, '/usr/share/zoneinfo/zone.tab']).decode().strip().split('\t')[0]

    print('\t'.join((ts, cache[tz])))
