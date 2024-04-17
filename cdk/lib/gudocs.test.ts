import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { GuDocs } from "./gudocs";

describe("The StarterTypescriptLambda stack", () => {
  it("matches the snapshot", () => {
    const app = new App();
    const stack = new GuDocs(app, "GuDocsAPI", { stack: "playground", stage: "TEST" });
    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});
