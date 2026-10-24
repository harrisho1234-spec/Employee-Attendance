FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts
COPY server.js ./
ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "server.js"]
