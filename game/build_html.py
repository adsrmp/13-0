import os
H = os.path.dirname(os.path.abspath(__file__))
tpl = open(os.path.join(H, 'app.html'), encoding='utf-8').read()
data = open(os.path.join(H, 'data.json'), encoding='utf-8').read()
import json
_im = json.load(open(os.path.join(H, 'images.json'), encoding='utf-8')); _im['agents'] = {}
img = json.dumps(_im)
qimg = open(os.path.join(H, 'quizimg.json'), encoding='utf-8').read()
body = tpl.replace('__DATA__', data.replace('</', '<\\/')).replace('__IMG__', img).replace('__QIMG__', qimg)

# 1) Artifact version (the viewer adds the document skeleton)
os.makedirs(os.path.join(H, 'dist'), exist_ok=True)
p = os.path.join(H, 'dist', 'thirteen-0.html')
open(p, 'w', encoding='utf-8').write(body)
print(p, os.path.getsize(p))

# 2) Website version for Cloudflare: a complete document
FAVICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%230d131c'/%3E"
           "%3Ctext x='32' y='43' font-family='Arial Narrow,Arial' font-weight='900' font-size='30' text-anchor='middle' fill='%23ece6db'%3E13%3C/text%3E"
           "%3Crect x='14' y='48' width='36' height='4' fill='%23ef5059'/%3E%3C/svg%3E")
head = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="13–0: draft five players from real VCT Masters and Champions rosters (2021–2026) and chase a flawless map. Unofficial fan project.">
<meta name="theme-color" content="#0d131c">
<meta property="og:title" content="13–0 VCT Draft">
<meta property="og:description" content="Draft real VCT rosters, play solo, versus a bot, or live with a friend.">
<link rel="icon" href="{FAVICON}">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="13–0">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<style>:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0;font:14px system-ui,-apple-system,"Segoe UI",sans-serif}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
</head>
<body>
"""
site = head + body + "\n</body>\n</html>\n"
out = os.path.join(os.path.dirname(H), 'public', 'index.html')
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w', encoding='utf-8').write(site)
print(out, os.path.getsize(out))
