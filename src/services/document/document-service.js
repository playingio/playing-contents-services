import assert from 'assert';
import makeDebug from 'debug';
import { Service, createService } from 'mostly-feathers-mongoose';
import fp from 'mostly-func';
import path from 'path';
import { plural } from 'pluralize';
import DocumentModel from '~/models/document-model';
import defaultHooks from './document-hooks';
import { subDocumentEvents } from './document-events';

const debug = makeDebug('playing:content-services:documents');

const defaultOptions = {
  name: 'documents'
};

class DocumentService extends Service {
  constructor(options) {
    options = Object.assign({}, defaultOptions, options);
    super(options);
  }

  setup(app) {
    super.setup(app);
    this.options.entities = app.get('entities');
    this.hooks(defaultHooks(this.options));
    subDocumentEvents(this.app, this.options);
  }

  find(params) {
    if (params.query.type && params.query.type !== 'document') {
      return this.app.service(plural(params.query.type)).find(params);
    } else {
      return super.find(params);
    }
  }

  get(id, params) {
    return super.get(id, params).then(doc => {
      if (doc && doc.type && doc.type !== 'document') {
        let service = plural(doc.type || 'document');
        debug('proxy document get => ', service, doc.id);
        return this.app.service(service).get(doc.id, params);
      } else {
        return doc;
      }
    });
  }

  create(data, params) {
    if (data.type && data.type !== 'document') {
      return this.app.service(plural(data.type)).create(data, params);
    } else {
      return super.create(data, params);
    }
  }

  update(id, data, params) {
    if (data.type && data.type !== 'document') {
      return this.app.service(plural(data.type)).update(id, data, params);
    } else {
      return super.update(id, data, params);
    }
  }

  patch(id, data, params) {
    if (data.type && data.type !== 'document') {
      return this.app.service(plural(data.type)).patch(id, data, params);
    } else {
      return super.patch(id, data, params);
    }
  }

  remove(id, params) {
    if (params.query.type && params.query.type !== 'document') {
      return this.app.service(plural(params.query.type)).remove(id, params);
    } else {
      if (params && params.query.more) {
        let more = [id].concat(params.query.more.split(','));
        delete params.query.more;
        return Promise.all(more.map(id => super.remove(id, params)));
      } else {
        return super.remove(id, params);
      }
    }
  }

  _tagDocument(id, data, params, doc) {
    assert(data.tags, 'data.tags not provided.');

    const svcTags = this.app.service('tags');

    let tags = fp.union(doc.tags || [], data.tags);
    return Promise.all([
      super.patch(doc.id, { tags }, params),
      data.tags.map((tag) => svcTags.action('upsert').create({
        id: tag.toLowerCase(),
        label: tag
      }))
    ]).then(([docs, tags]) => docs);
  }

  _untagDocument(id, data, params, doc) {
    assert(data.tags, 'data.tags not provided.');

    let tags = fp.without(data.tags, doc.tags || []);
    return super.patch(doc.id, { tags }, params);
  }

  _copyDocument(id, data, params, target) {
    assert(data.documents, 'data.documents not provided.');
    assert(data.target, 'data.target not provided.');
    debug('copyDocument target', target.id, data.documents);

    const copyDoc = (id) => {
      return this.get(id).then((doc) => {
        let service = plural(doc.type || 'document');
        let clone = fp.omit(['id', 'metadata', 'parent', 'path', 'createdAt', 'updatedAt', 'destroyedAt'], doc);
        clone.parent = target.id;
        return this.app.service(service).create(clone);
      });
    };

    return Promise.all(data.documents.map(copyDoc));
  }

  _moveDocument(id, data, params, target) {
    assert(data.documents, 'data.documents not provided.');
    assert(data.target, 'data.target not provided.');
    debug('moveDocument target', target.id, data.documents);

    const moveDoc = (id) => {
      return this.get(id).then((doc) => {
        let service = plural(doc.type || 'document');
        let data = {
          parent: target.id,
          path: path.resolve(target.path, path.basename(doc.path)),
          type: doc.type
        };
        return this.app.service(service).patch(doc.id, data);
      });
    };

    return Promise.all(data.documents.map(moveDoc));
  }

  _lockDocument(id, data, params, doc) {
    return super.patch(doc.id, {
      locker: data.creator,
      lockedAt: new Date()
    });
  }

  _unlockDocument(id, data, params, doc) {
    return super.patch(doc.id, {
      locker: null,
      lockedAt: null
    });
  }

  _addPermission(id, data, params, doc) {
    assert(data.permission, 'data.permission is not provided');
    assert(data.user, 'data.user is not provided');
    
    let ACL = Object.assign(doc.ACL || {}, {
      [data.user]: {
        creator: params.user.id,
        permission: data.permission,
        granted: true,
        begin: data.begin,
        end: data.end
      }
    });
    return super.patch(doc.id, { ACL }, params);
  }

  _replacePermission(id, data, params, doc) {
    return this.addPermission(id, data, params, doc);
  }

  _removePermission(id, data, params, doc) {
    assert(data.permission, 'data.permission is not provided');
    assert(data.user, 'data.user is not provided');

    let ACL = fp.dissoc(data.user, doc.ACL || {});
    return super.patch(doc.id, { ACL }, params);
  }

  _blockPermissionInheritance(id, data, params, doc) {
    let ACL = Object.assign(doc.ACL || {}, {
      '*': {
        inherited: false
      }
    });
    return super.patch(doc.id, { ACL }, params);
  }

  _unblockPermissionInheritance(id, data, params, doc) {
    let ACL = Object.assign(doc.ACL || {}, {
      '*': {
        inherited: true
      }
    });
    return super.patch(doc.id, { ACL }, params);
  }
}

export default function init(app, options) {
  options = Object.assign({ ModelName: 'document' }, options);
  return createService(app, DocumentService, DocumentModel, options);
}

init.Service = DocumentService;
