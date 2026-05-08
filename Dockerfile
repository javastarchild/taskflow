FROM node:20-slim
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Build React SPA
COPY . .
RUN npm run build

# Planner dir is mounted at runtime via volume
ENV PLANNER_DIR=/planner
ENV PORT=3000

EXPOSE 3000
CMD ["node", "server/index.js"]
