#!/usr/bin/env bash
set -euo pipefail

mkdir -p /files/Trash /files/users /files/shared /tmp/nginx-client-body /etc/nginx/certs

case "${FILESERVER_HTTPS_REDIRECT_PORT}" in
  ''|*[!0-9]*)
    echo "FILESERVER_HTTPS_PORT must be numeric" >&2
    exit 1
    ;;
esac

if [ ! -s /etc/nginx/certs/fileserver.crt ] || [ ! -s /etc/nginx/certs/fileserver.key ]; then
  umask 077
  openssl req -x509 -nodes -newkey rsa:2048 -sha256 \
    -days "${FILESERVER_CERT_DAYS}" \
    -keyout /etc/nginx/certs/fileserver.key \
    -out /etc/nginx/certs/fileserver.crt \
    -subj "/CN=${FILESERVER_CERT_CN}" \
    -addext "subjectAltName=${FILESERVER_CERT_SAN}"
fi

chmod 600 /etc/nginx/certs/fileserver.key
chmod 644 /etc/nginx/certs/fileserver.crt

# Build a clean explorer runtime from the original source.
# 1) Add the missing closeDrawer element directly.
# 2) Normalize any invalid persisted view value.
# 3) Isolate URL hash updates so Safari hash parsing cannot abort navigation.
sed \
  -e "s/sizeFilter:\$('sizeFilter')};/sizeFilter:\$('sizeFilter'),closeDrawer:\$('closeDrawer')};/" \
  -e "s/view:localStorage.getItem('fs-view')||'list'/view:localStorage.getItem('fs-view')==='grid'?'grid':'list'/" \
  -e "s/location.hash='#\/'+enc(path,true)/try{location.hash='#\/'+enc(path,true)}catch(hashError){console.warn('FileServer hash update skipped',hashError)}/" \
  /tmp/explorer-v2-source.js > /tmp/explorer-v2.js

grep -q "closeDrawer:\$('closeDrawer')" /tmp/explorer-v2.js
grep -q "FileServer hash update skipped" /tmp/explorer-v2.js

cat /tmp/mobile-responsive-source.css \
    /tmp/icon-theme.css \
    /tmp/navigation-enhancements.css \
    /tmp/exclusive-view.css \
    > /tmp/mobile-responsive.css

cat /tmp/create-menu-source.css \
    /tmp/mobile-toolbar-fix.css \
    > /tmp/create-menu.css

cp /tmp/toolbar-context-source.js /tmp/toolbar-context.js

sed 's#<button class="cmd" id="newFolder"#<button class="cmd" id="newCreateAction" title="새 파일 또는 새 폴더 만들기" aria-haspopup="menu" aria-expanded="false"><span class="fs-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span></button><button class="cmd" id="newUploadAction" title="파일 또는 폴더 업로드" aria-haspopup="menu" aria-expanded="false"><span class="fs-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg></span></button><button class="cmd view-action" id="listViewAction" title="목록형 보기" aria-pressed="false"><span class="fs-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 6h13M7 12h13M7 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg></span></button><button class="cmd view-action" id="gridViewAction" title="아이콘 보기" aria-pressed="false"><span class="fs-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg></span></button><button class="cmd" id="newFolder"#; s#</head>#<link rel="stylesheet" href="/mobile-responsive.css?v=clean4"><link rel="stylesheet" href="/toolbar-compact.css?v=clean4"><link rel="stylesheet" href="/create-menu.css?v=clean4"></head>#; s#</body>#<script src="/explorer-extras.js?v=clean4"></script><script src="/toolbar-context.js?v=clean4"></script><script src="/mobile-toolbar-fix.js?v=clean4"></script></body>#' \
  /tmp/index.html > /tmp/fileserver-index.html

sed 's#</body>#<script src="/auth-assets/admin-storage.js"></script></body>#' \
  /tmp/auth-ui/admin.html > /tmp/fileserver-admin.html

rm -f /etc/nginx/sites-enabled/default
sed "s/__HTTPS_REDIRECT_PORT__/${FILESERVER_HTTPS_REDIRECT_PORT}/g" \
  /etc/nginx/sites-available/default \
  > /etc/nginx/sites-enabled/default

nginx -t
exec nginx -g 'daemon off;'
