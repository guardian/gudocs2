import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { GuDocs, GuDocsCertificate } from "./gudocs";

describe("The GuDocs stack", () => {
  it("matches the snapshot", () => {
    const app = new App();
    const stack = new GuDocs(app, "GuDocsAPI", { stack: "playground", stage: "TEST" });
    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});

describe("The GuDocsCertificate stack", () => {
  it("matches the snapshot", () => {
    const app = new App();
    const stack = new GuDocsCertificate(app, "GuDocsAPI", { stack: "playground", stage: "TEST", domainName: "gudocs.test.dev-gutools.co.uk" });
    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});
