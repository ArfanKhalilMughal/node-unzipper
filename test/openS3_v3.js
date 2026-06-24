const test = require("tap").test;
const fs = require("fs");
const path = require("path");
const Stream = require("stream");
const unzip = require("../unzip");

const version = +process.version.replace("v", "").split(".")[0];
const hasAwsCredentials = Boolean(
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
);
const skipReason =
  version < 16
    ? "Skipping: Node.js < 16"
    : !hasAwsCredentials && "Skipping: No AWS credentials available";

function createS3ClientMock(buffer) {
  return {
    send: async function(command) {
      if (command.constructor.name == "HeadObjectCommand") {
        return {
          ContentLength: buffer.length,
        };
      }

      if (command.constructor.name == "GetObjectCommand") {
        const match = command.input.Range.match(/^bytes=(\d+)-(\d*)$/);
        const offset = Number(match[1]);
        const end = match[2] ? Number(match[2]) + 1 : undefined;
        const stream = Stream.PassThrough();

        stream.end(buffer.slice(offset, end));

        return {
          Body: stream,
        };
      }

      throw new Error("Unexpected command: " + command.constructor.name);
    },
  };
}

test(
  "get content of a single file entry out of a zip",
  { skip: skipReason },
  function (t) {
    const archive = path.join(__dirname, "../testData/compressed-standard/archive.zip");
    const buffer = fs.readFileSync(archive);
    const client = createS3ClientMock(buffer);

    return unzip.Open.s3_v3(client, {
      Bucket: "test",
      Key: "archive.zip",
    }).then(function (d) {
      const file = d.files.filter(function (file) {
        return file.path == "file.txt";
      })[0];

      return file.buffer().then(function (str) {
        const fileStr = fs.readFileSync(path.join(__dirname, "../testData/compressed-standard/inflated/file.txt"), "utf8");
        t.equal(str.toString(), fileStr);
        t.end();
      });
    });
  }
);
