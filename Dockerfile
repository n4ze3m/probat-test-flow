FROM node:14-alpine

WORKDIR /app

COPY package*.json .
COPY prisma ./prisma/

RUN npm install

COPY . .

CMD ["npm", "start"]