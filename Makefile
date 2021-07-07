#for i in messages/*.tsv; do join -1 2 -2 1 <(sort -k2 $i) export-new/users-tzmap.tsv > $i.tz; done;
#cat messages/*.tz > messages-tz.tsv

messages-cc.json: messages-cc.tsv
	cat messages-cc.tsv | jq --raw-input --slurp 'split("\n") | map(split("\t"))' > messages-cc.json

messages-cc.tsv: messages-tz.tsv
	python process.py < messages-tz.tsv > messages-cc.tsv
