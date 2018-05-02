const app = require('express')();
const sql = require('mssql');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs-extra');
const compression = require('compression');
const { v4 } = require('uuid');

const { mssql } = require('./config');

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, path.join(__dirname, 'uploads'));
	},
	filename: (req, file, cb) => {
		cb(null, `${v4()}.${file.mimetype.split('/').slice(-1)}`);
	}
});
const upload = multer({ storage });

app.use(cors());
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

Array.prototype.getIndexBy = function (name, value) {
    for (var i = 0; i < this.length; i++) {
        if (this[i][name] == value) {
            return i;
        }
    }
    return -1;
}

const insertIntoMssql = async (filename, registrationNumber, profilePic) => {
    return new Promise(async (resolve, reject) => {
        try{
            const transaction = new sql.Transaction();
            transaction.begin(async err => {
                if(err) { throw err; }
                const request = new sql.Request();
                request.multiple = true;
                request.query(`INSERT INTO photo (registrationNumber, photo, profilePic) values ('${registrationNumber}', '${filename}', ${profilePic});SELECT SCOPE_IDENTITY() AS [SCOPE_IDENTITY];`, async (err, result) => {
                    if(err) { throw err; }
                    request.query(`SELECT * FROM photo WHERE ID=${result.recordset[0].SCOPE_IDENTITY}`, async (err, result) => {
                        transaction.commit(async err => {
                            if(err) { throw err; }
                            return resolve(result.recordset[0]);
                        });
                    });
                });
            });
        }catch(err){
            if(await fs.pathExists(path.join(__dirname, 'uploads/filename'))){
                await fs.remove(path.join(__dirname, 'uploads/filename'));
            }
            return err;
        }
    });
};

const photo = async (req, res, next) => {
        try{
            let data;
            let dataset=[];
            if(req.files.getIndexBy('fieldname', 'photo') >= 0){
                data = await insertIntoMssql(req.files[req.files.getIndexBy('fieldname', 'photo')]['filename'], '12345', 1);
                req.files.splice(req.files.getIndexBy('fieldname', 'photo'), 1);
                dataset.push(data);
            }
            if(req.files.length >= 1){
                for(let file of req.files){
                    data = await insertIntoMssql(file['filename'], '12345', 0);
                    dataset.push(data);
                }
            }
            return res.status(200).send({ success: true, dataset: JSON.stringify(dataset) });
        }catch(err){
            return res.status(500).send('Internal server error');
        }
    }

const router = require('express').Router();

router.post('/upload', upload.any(), photo);

app.use('/', router);
app.use('/images', require('express').static(path.join(__dirname, 'uploads')));

const server = async () => {
    try {
        const pool = await sql.connect(mssql)
        app.listen(process.env.PORT || 4040, () => {
            console.log('Server started');
        });
    } catch (err) {
        console.log(err);
        process.exit(1);
    }
}

server();