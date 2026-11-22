import sys, json, urllib.request, urllib.parse, re
q=sys.argv[1]
p={'action':'query','generator':'search','gsrnamespace':'6','gsrsearch':q,'gsrlimit':'25','prop':'imageinfo','iiprop':'url|size|extmetadata','iiurlwidth':'2400','format':'json'}
u='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(p)
r=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'switchyard-landing-build/0.1'}))
d=json.load(r)
for pg in d.get('query',{}).get('pages',{}).values():
    ii=pg['imageinfo'][0]; m=ii['extmetadata']
    lic=m.get('LicenseShortName',{}).get('value','?')
    if ii['width']<1600: continue
    print(pg['title'],ii['width'],ii['height'],lic,sep=' | ')
