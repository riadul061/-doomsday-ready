FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DB_PATH=/data/doomsday.db
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
VOLUME /data
EXPOSE 3001
CMD ["node", "--no-warnings=ExperimentalWarning", "src/server.js"]
