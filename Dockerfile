# Runtime-Image: dist/ und server/ werden auf dem Mac gebaut und per rsync
# hochgeladen (siehe deploy.sh). Kein npm im Image, keine Laufzeit-Pakete.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8340
ENV HOST=0.0.0.0

COPY dist ./dist
COPY server ./server

# Ablage für Einträge, Sessions, Logos. Im Betrieb ein Bind-Mount, damit
# ein Container-Tausch nichts verliert. Ohne Mount muss der Ordner node gehören.
RUN mkdir -p /app/data && chown node:node /app/data

EXPOSE 8340
USER node
CMD ["node", "--max-old-space-size=128", "server/index.mjs"]
