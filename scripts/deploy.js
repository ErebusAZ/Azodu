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
const privateKeyPath = '/Users/chris/Desktop/blink/creds/discuss';

// Function to handle the deployment process
function deployServer(server, callback) {
    let ssh = new NodeSSH(); // Create a new instance for each connection
    console.log(`Starting deployment on ${server}`);
    fs.readFile(privateKeyPath, 'utf8', (err, privateKey) => {
        if (err) {
            console.error(`Error reading private key from file: ${err}`);
            return callback(err);
        }
        ssh.connect({
            host: server,
            username: username,
            privateKey: privateKey
        })
        .then(() => {
            console.log(`Connected to ${server}`);
            const command = `git pull`;
            return ssh.execCommand(command, { cwd: '/opt/azodu' });
        })
        .then(result => {
            console.log(`STDOUT (${server}): ${result.stdout}`);
            console.log(`STDERR (${server}): ${result.stderr}`);
            if (result.code !== 0) {
                throw new Error(`Deployment failed on ${server} with exit code ${result.code}`);
            }
            callback(null, `Success: ${server}`); // Success callback
        })
        .catch(err => {
            console.error(`Error in deploying to ${server}: ${err}`);
            callback(err); // Error callback
        })
        .finally(() => {
            ssh.dispose(); // Ensure SSH connection is disposed after operations
        });
    });
}

// Use async to handle multiple deployments serially
async.mapSeries(servers, deployServer, (err, results) => {
    if (err) {
        console.error('Deployment failed:', err);
    } else {
        console.log('All deployments attempted:', results);
    }
});
