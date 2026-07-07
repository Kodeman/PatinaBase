# Media processor image. Must run on linux/amd64 (Cloudflare Containers).
# node:20 (Debian) — sharp ships prebuilt libvips binaries, so no vips-dev needed
# for the image path. (3D/mesa deps are added when the 3D ops are ported.)
FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.mjs ./

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.mjs"]
