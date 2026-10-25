#!/usr/bin/env bash
# Switch the e2e suite to other Prisma / Vitest versions (used by the CI matrix).
# Usage: e2e/scripts/use-versions.sh <prisma: 6|7|next> <vitest: 4.1|5>
set -euo pipefail
cd "$(dirname "$0")/.."

case "$1" in
  next) prisma="$(npm view @prisma/client dist-tags.dev)" ;;
  *) prisma="^$1" ;;
esac
vitest="^$2"

pnpm add -D "prisma@$prisma" "@prisma/client@$prisma" "@prisma/adapter-pg@$prisma" \
  "@prisma/adapter-mariadb@$prisma" "@prisma/adapter-better-sqlite3@$prisma" "vitest@$vitest"
pnpm --dir .. add -D "vitest@$vitest"

# Prisma 6 still requires the connection URL in the schema; Prisma 7+ reads it from prisma.config.ts.
if [ "$1" = "6" ]; then
  sed -i 's#^  provider = "\(sqlite\|postgresql\|mysql\)"#&\n  url      = env("DATABASE_URL")#' prisma/*/schema.prisma
fi
