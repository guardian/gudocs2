import serverlessExpress from '@codegenie/serverless-express';
import { default as express } from "express";
import { doPublish, doSchedule, readDocuments, renderDashboard } from './index';

const server = express();
server.use(express.json());
server.use(express.urlencoded({ extended: true }));

server.get("/documents", (_, response) => {
    readDocuments(undefined, undefined).then((r) => {
        response.json(r);
    })
});

server.get("/", (_, response) => {
    renderDashboard().then((r) => {
        response.send(r);
    })
});

server.post("/schedule", (_, response) => {
    doSchedule().then((r) => {
        response.json({
            result: r
        })
    })
});

server.post("/publish", (request, response) => {
    const fileId = request.body.id;
    doPublish(fileId).then((r) => {
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