// @ts-check
const fs = require('fs');
const hummus = require('hummus');
const os = require('os');
const extractText = require('./lib/text-extraction');

class PDF {
  constructor() {
    this._files = null;
    this._decryptedFiles = null;
    this._config = this.getConfig();
    this._totalNetPay = 0;
    this.run();
  }

  /**
   * @returns {Array<string>}
   */
  get files() {
    return this._files;
  }

  get decryptedFiles() {
    return this._decryptedFiles;
  }

  /**
   * @returns {number}
   */
  get totalNetPay() {
    // @ts-ignore
    return this._totalNetPay.toFixed(2);
  }

  /**
   * @returns {{passwords: string, originPath: string, decryptedPath: string, tempDestinationPath: string}}
   */
  get config() {
    return this._config;
  }

  getFilesDirectory() {
    return fs.readdirSync(this.config.originPath);
  }

  getFiles() {
    return [].concat(this.getFilesDirectory()).filter(v => v.endsWith('.pdf'));
  }

  getDecryptedFiles() {
    return fs.readdirSync(this.config.decryptedPath);
  }

  getConfig() {
    try {
      return JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    } catch (e) {
      throw new Error('Unable to read config or missing');
    }
  }

  getOriginFilePath(file) {
    return this.config.originPath + '/' + file;
  }

  getDecryptedFilePath(file) {
    return this.config.decryptedPath + '/' + file;
  }

  getTempDecryptedFilePath(file) {
    return os.homedir() + '/' + this.config.tempDestinationPath + '/' + file;
  }

  createFolderIfNotExist(name, path) {
    try {
      if (!fs.existsSync(path + '/' + name)) {
        fs.mkdirSync(path + '/' + name);
      }
    } catch (e) {
      throw new Error(e);
    }
  }

  hasFile(file, path) {
    return fs.readdirSync(path).find(i => i === file) ? true : false;
  }

  decryptFile(file, index) {
    try {
      hummus.recrypt(
        this.getOriginFilePath(file),
        this.getTempDecryptedFilePath(file),
        {
          password: this.config.passwords.split('|')[index]
        }
      );
      return this.getTempDecryptedFilePath(file);
    } catch (error) {
      return this.decryptFile(file, index + 1);
    }
  }

  /**
   *
   * @param {any[][]} pages
   * @param {RegExp} regex
   */
  searchInPages(pages, regex) {
    return pages.map(page =>
      page
        .map(line => line.text.replace(/\0/g, ''))
        .filter(line => line.search(regex) > -1)
    )[0];
  }

  /**
   *
   * @param {any} text
   * @returns {number} amount
   */
  extractAmount(text) {
    if (text) {
      const idx = text.search(/pay/i);
      const raw = text.slice(idx + 3, text.length);
      const spl = raw.split('.');
      const amount = Number(
        spl[0]
          .concat('.')
          .concat(spl[1].slice(0, 2))
          .split(',')
          .join('')
      );
      this._totalNetPay += amount;
      return amount;
    }
  }

  /**
   *
   * @param {string} text
   * @param {string} origin
   * @param {string} destination
   */
  renameFileWithPayDate(text, origin, destination) {
    if (text) {
      const spl = text.split(':');
      const idx = spl.findIndex(i => i.search(/cheque date/i) > -1);
      const dateRaw = spl[idx + 1].trim().split(/\/|-/);
      const date =
        dateRaw[0].length !== 4 ? dateRaw.reverse().join('') : dateRaw.join('');
      if (!fs.existsSync(origin)) {
        throw new Error(`file ${origin} not found`);
      }
      if (!fs.existsSync(destination)) {
        throw new Error(`directory ${destination} not found`);
      }
      if (!fs.lstatSync(destination).isDirectory()) {
        throw new Error(`${destination} is not a directory`);
      }
      if (!fs.existsSync(destination + '/paystub-' + date + '.pdf')) {
        fs.renameSync(origin, destination + '/paystub-' + date + '.pdf');
      }
      return date;
    }
  }

  run() {
    console.log('Extracting Net Pay, Please wait....');
    this._files = this.getFiles();
    this.createFolderIfNotExist(this.config.tempDestinationPath, os.homedir());
    if (this.files !== null || this.files.length > 0) {
      this.files.forEach(file => {
        let unlockedFile = this.decryptFile(file, 0);
        let pdfReader = hummus.createReader(unlockedFile);
        var pagesPlacements = extractText(pdfReader);
        const payAndDate = this.searchInPages(
          pagesPlacements,
          /(^net pay)|(Cheque Date:)/i
        );
        this.extractAmount(payAndDate.find(i => i.search(/^net pay/i) > -1));
        this.renameFileWithPayDate(
          payAndDate.find(i => i.search(/Cheque Date:/i) > -1),
          unlockedFile,
          this.config.decryptedPath
        );
        // fs.unlinkSync(unlockedFile);
      });
      console.log(this.totalNetPay);
    } else {
      throw new Error(`No PDF files found in ${this.config.originPath}`);
    }
  }
}

new PDF();
