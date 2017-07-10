import toBuffer from 'concat-stream';
import { getBase64DataURI, parseDataURI } from 'dauria';
import errors from 'feathers-errors';
import mimeTypes from 'mime-types';
import { extname } from 'path';

import assert from 'assert';
import makeDebug from 'debug';
import { Service, createService } from 'mostly-feathers-mongoose';

import BlobModel from '~/models/blob-model';
import defaultHooks from './blob-hooks';
import { fromBuffer, bufferToHash } from './util';

const debug = makeDebug('playing:content-services:blob');

const defaultOptions = {
  name: 'blob-service',
  fileCDN: '/file/'
};

class BlobService extends Service {
  constructor(options) {
    options = Object.assign({}, defaultOptions, options);
    super(options);

    if (!options.Storage) {
      throw new Error('BlobService `options.Storage` must be provided');
    }

    this.Storage = options.Storage;
    this.fileCDN = options.fileCDN;
  }

  setup(app) {
    super.setup(app);
    this.hooks(defaultHooks({
      fileCDN: this.fileCDN
    }));
  }

  get(id, params) {
    let [batchId, idx] = id.split('.');
    debug('get', batchId, idx);

    const readBlob = (blob) => {
      debug('readBlob', blob);
      return new Promise((resolve, reject) => {
        this.Storage.createReadStream({
          key: blob.key
        })
        .on('error', reject)
        .pipe(toBuffer(buffer => {
          blob.file = getBase64DataURI(buffer, blob.mimetype);
          resolve(blob);
        }));
      });
    };

    if (idx !== undefined) {
      return this._getBlob(batchId, idx).then(blob =>
        params.query.embedded !== undefined? readBlob(blob) : blob);
    } else {
      return super.get(id, params);
    }
  }

  _getBlob(batchId, idx) {
    return super.get(batchId).then(result => {
      if (!result) throw new Error('Blob batch id not exists');
      const batch = result.data || result;
      const blobs = batch.blobs || [];
      if (idx >= blobs.length) throw new Error('Blob index out of range of the batch');
      return blobs[idx];
    });
  }

  create(data, params) {
    return super.create(data, params);
  }

  update(id, data, params) {
    debug('update', id, data, params);
    assert(params.file, 'params file not uploaded.');
    assert(params.file.buffer && params.file.buffer.type === 'Buffer', 'params file has no buffer.');

    const name = params.file.originalName;
    const mimetype = params.file.mimetype;
    const ext = mimeTypes.extension(mimetype);
    const buffer = Buffer.from(params.file.buffer.data);
    const size = params.file.size;

    const getBatch = (id) => {
      return super.get(id).then(result => {
        if (!result) throw new Error('Blob batch id not exists');
        return result.data || result;
      });
    };

    const writeBlob = (batch) => {
      batch.blobs = batch.blobs || [];
      const idx = data.fileIdx || batch.blobs.length;
      const key = `${id}.${idx}.${ext}`;
      return new Promise((resolve, reject) => {
        fromBuffer(buffer)
          .pipe(this.Storage.createWriteStream({
            key, name, mimetype, size
          }, (error) => {
            if (error) return reject(error);
            let blob = {
              idx, name, key, mimetype, size
            };
            if (idx < batch.blobs.length) {
              batch.blobs[idx] = blob;
            } else {
              batch.blobs.push(blob);
            }
            return resolve(batch.blobs);
          }))
          .on('error', reject);
      });
    };

    const updateBlobs = (blobs) => {
      return super.patch(id, { blobs: blobs }).then(batch => {
        let blob = batch.blobs[batch.blobs.length - 1];
        return blob;
      });
    };

    return getBatch(id)
      .then(writeBlob)
      .then(updateBlobs);
  }

  patch(id, data, params) {
    return super.update(id, data, params);
  }

  remove (id) {
    let [batchId, idx] = id.split('.');
    debug('remove', batchId, idx);

    const removeBlob = blob => {
      debug('remove blob', blob);
      return new Promise((resolve, reject) => {
        this.Storage.remove({
          key: blob.key
        }, error => error ? reject(error) : resolve(blob));
      });
    };

    if (idx !== undefined) {
      return this._getBlob(batchId, idx).then(removeBlob);
    } else {
      return super.remove(batchId);
    }
  }
}

export default function init(app, options) {
  options = Object.assign({ ModelName: 'blob' }, options);
  return createService(app, BlobService, BlobModel, options);
}

init.Service = BlobService;
