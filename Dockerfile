# node:sqlite (the central store) needs Node >= 22.5
FROM node:22-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci

# Build the React SPA; the API server serves it from /build
COPY . .
RUN npm run build

# All projects, goals and tasks live in one SQLite file on this volume.
ENV TASKFLOW_DB=/data/taskflow.db
ENV PORT=3000
VOLUME /data

EXPOSE 3000
# The server refuses to listen beyond loopback without TASKFLOW_TOKEN.
CMD ["node", "server/index.js"]
