FROM node:24-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .

ENV NODE_ENV=production
ENV PORT=4173
EXPOSE 4173
VOLUME ["/app/data"]

CMD ["npm", "run", "start"]
