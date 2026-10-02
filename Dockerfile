FROM node:26.10.0-alpine AS generator
RUN apk add --no-cache git
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY bin ./bin
COPY src ./src
COPY schema ./schema
COPY public ./public
COPY catalogue ./catalogue
COPY docker/site.json ./docker/site.json
CMD ["node", "bin/apps-site.mjs", "build", "--config", "docker/site.json"]
