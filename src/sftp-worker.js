const Client = require('ssh2-sftp-client');
const action = process.argv[2];
const host = process.argv[3];
const port = parseInt(process.argv[4]);
const username = process.argv[5];
const password = process.argv[6];
const targetPath = process.argv[7];
const content = process.argv[8] || '';

async function main() {
  const sftp = new Client();
  try {
    await sftp.connect({ host, port, username, password, readyTimeout: 10000 });
    let result;
    if (action === 'list') {
      result = await sftp.list(targetPath);
    } else if (action === 'get') {
      const buf = await sftp.get(targetPath);
      result = buf.toString('utf-8');
    } else if (action === 'put') {
      await sftp.put(Buffer.from(content, 'utf-8'), targetPath);
      result = { ok: true };
    } else if (action === 'delete') {
      const stat = await sftp.stat(targetPath);
      if (stat.isDirectory) await sftp.rmdir(targetPath, true);
      else await sftp.delete(targetPath);
      result = { ok: true };
    }
    console.log(JSON.stringify({ success: true, data: result }));
  } catch (e) {
    console.log(JSON.stringify({ success: false, error: e.message }));
  } finally {
    sftp.end();
  }
}
main();
