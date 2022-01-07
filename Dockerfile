FROM nodered/node-red:latest-minimal

COPY ./src /nodes/src

USER root
RUN cd /usr/src/node-red && npm install /nodes/src
    
USER node-red