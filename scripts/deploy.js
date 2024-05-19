require('dotenv').config();
const { NodeSSH } = require('node-ssh');
const async = require('async');
const fs = require('fs');

// List of servers
const servers = [
    '104.207.133.44',
    '66.135.5.144',
    '64.176.223.182'
];

// SSH and Git credentials
const username = 'root';
const privateKey = fs.readFileSync('/Users/chris/Desktop/blink/creds/discuss', 'utf8');

// Function to handle the deployment process for one server
function deployServer(server, callback) {
    const ssh = new NodeSSH(); // Create a new instance for each server
    console.log(`Starting deployment on ${server}`);
    ssh.connect({
        host: server,
        username: username,
        privateKey: privateKey
    })
    .then(() => {
        console.log(`Connected to ${server}`);
        return ssh.execCommand('git fetch --all && git reset --hard origin/main && git clean -fd', { cwd: '/opt/azodu' });
    })
    .then(result => {
        console.log(`STDOUT (${server}): ` + result.stdout);
        console.log(`STDERR (${server}): ` + result.stderr);
        if (result.code !== 0) {
            throw new Error(`Deployment failed on ${server} with exit code ${result.code}`);
        }
        console.log(`Deployment successful on ${server}`);
        return ssh.execCommand('reboot'); // Reboot the server
    })
    .then(() => {
        console.log(`Reboot initiated on ${server}`);
        callback(null, `Success: ${server}`);
    })
    .catch(err => {
        console.error(`Error in deploying or rebooting on ${server}: ${err}`);
        callback(err);
    })
    .finally(() => {
        ssh.dispose(); // Ensure SSH connection is disposed after operations
    });
}

// Use async.series to handle one deployment at a time
async.series(servers.map(server => callback => deployServer(server, callback)), (err, results) => {
    if (err) {
        console.error('Deployment failed:', err);
    } else {
        console.log('All deployments attempted:', results);
    }
});
