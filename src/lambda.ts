import serverlessExpress from '@codegenie/serverless-express';
import { default as express } from "express";
import { doSchedule, readDocuments } from './index';
const server = express();
server.use(express.json());

server.get("/documents", (_, response) => {
    readDocuments(undefined, undefined).then((r) => {
        response.json(r);
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