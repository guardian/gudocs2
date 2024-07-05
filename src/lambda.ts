import serverlessExpress from '@codegenie/serverless-express';
import { default as express } from "express";
import { doSchedule, readDocuments } from './index';
import { index } from './templates/index';
import { renderToString } from 'react-dom/server';
import { style } from './templates/style';

const server = express();
server.use(express.json());

server.get("/documents", (_, response) => {
    readDocuments(undefined, undefined).then((r) => {
        response.json(r);
    })
});

server.get("/", (_, response) => {
    readDocuments(undefined, undefined).then((r) => {
        response.send(renderToString(index(style, "lastSaved", "email", r.files))); // todo: lastSaved and Email
    })
});

server.post("/schedule", (_, response) => {
    doSchedule().then((r) => {
        response.json({
            result: r
        })
    })
});


process.on('uncaughtException', err => {
    console.log(err)
})

exports.handler = serverlessExpress({ app: server })

const PORT = 3030;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));