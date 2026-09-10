FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=10000
EXPOSE 10000
CMD ["npm", "run", "start"]
