# Caddy con el módulo DNS de DuckDNS.
#
# La imagen oficial no trae proveedores DNS, y sin el módulo la directiva
# `tls { dns duckdns ... }` no existe. Se compila con xcaddy.
#
# Hace falta porque el desafío HTTP-01 exige el puerto 80, que en este VPS
# pertenece a otro stack que no se puede tocar. DNS-01 no usa puertos
# entrantes: prueba el control del dominio con un registro TXT.

FROM caddy:2-builder-alpine AS build
RUN xcaddy build --with github.com/caddy-dns/duckdns

FROM caddy:2-alpine
COPY --from=build /usr/bin/caddy /usr/bin/caddy
