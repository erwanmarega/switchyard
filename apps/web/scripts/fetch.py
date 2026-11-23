# usage: fetch.py <outdir> <slug> <File:Title>  -> downloads 2400px thumb + writes slug.json
import sys, json, urllib.request, urllib.parse, re, html, time
out,slug,title=sys.argv[1:4]
H={'User-Agent':'switchyard-landing-build/0.1'}
p={'action':'query','titles':title,'prop':'imageinfo','iiprop':'url|size|extmetadata','iiurlwidth':'2800','format':'json'}
d=json.load(urllib.request.urlopen(urllib.request.Request('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(p),headers=H)))
ii=list(d['query']['pages'].values())[0]['imageinfo'][0]; m=ii['extmetadata']
g=lambda k:html.unescape(re.sub('<[^>]+>','',m.get(k,{}).get('value','')))
lic=g('LicenseShortName')
assert re.search(r'public domain|CC0|no restrictions',lic,re.I),lic
meta={'title':title[5:],'author':g('Artist') or 'Unknown','license':lic,'source_url':ii['descriptionurl']}
url=ii.get('thumburl') or ii['url']
time.sleep(2)
data=urllib.request.urlopen(urllib.request.Request(url,headers=H)).read()
ext='png' if data[:4]==b'\x89PNG' else 'jpg'
open(f'{out}/{slug}.{ext}','wb').write(data)
json.dump(meta,open(f'{out}/{slug}.json','w'),indent=1)
print(slug,len(data),meta)
