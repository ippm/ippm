FROM node:5-slim

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# install deps
COPY package.json /usr/src/app
RUN npm install

# install app
COPY ippm-adder.min.js{,.map} /usr/src/app

CMD ["node", "ippm-adder.min.js"]
