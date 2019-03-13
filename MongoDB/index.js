const {
  $pluralName,
  $validateContext,
  $context,
  $id
} = Entity = require('@oudy/entity'),
  MongoDB = require('@oudy/mongodb'),
  $database = Symbol('database'),
  $collection = Symbol('collection'),
  MongoDBBatch = require('@oudy/mongodb/batch');

class MongoDBEntity extends Entity {
  bind(state, trackChange = true, bindObject = {}) {
    if (state._id) {
      state.id = state._id.toHexString && state._id.toHexString() || state._id
      delete state._id
    }
    return super.bind(state, trackChange, bindObject)
  }
  save(bind) {
    const database = this.constructor[$database](this[$context]),
      collection = this.constructor[$collection](this[$context])
    let $return
    if (this.id)
      $return = MongoDBBatch.update(this.id, this.mongoDBDocument(), collection, database)
    else if (this[$id])
      $return = MongoDBBatch.upsert(this[$id], this.mongoDBDocument(), collection, database).then(
        id => {
          this.id = id || this[$id]
          return id
        }
      )
    else
      $return = MongoDBBatch.insert(this.mongoDBDocument(), collection, database).then(
        id =>
          this.id = id
      )
    return $return.then(
      id =>
        super.save(bind, id)
    )
  }
  mongoDBDocument() {
    let document = JSON.parse(this.json())
    delete document.id
    return document
  }
  static load(id, context = {}) {
    return this[$validateContext](context).then(
      context => {
        if (!id)
          return super.load(id, context)
        const database = this[$database](context),
          collection = this[$collection](context)
        return MongoDBBatch.load(id, collection, database).then(
          document =>
            super.load(id, context, document)
        )
      }
    )
  }
  static loadAll({ query = {}, limit = 20, page = 1, sort = {} } = {}, context = {}) {
    return this[$validateContext](context).then(
      context => {
        const database = this[$database](context),
          collection = this[$collection](context),
          cursor = MongoDB.getConnection(database).collection(collection).find(query)
        return Promise.all([
          cursor.count(),
          cursor.sort(sort).skip(limit * (page - 1)).limit(limit).toArray().then(
            documents =>
              documents.map(
                document =>
                  super.load(document._id.toHexString && document._id.toHexString() || document._id, context, document)
              )
          )
        ]).then(
          ([total, list]) => ({
            total,
            list,
            page,
            limit,
            sort
          })
        )
      }
    )
  }
}

MongoDBEntity[$database] = function () {
  return 'default'
}
MongoDBEntity[$collection] = function (context) {
  return this[$context].map(
    key =>
      `${key}:${context[key]}`

  ).concat(this[$pluralName]().toLowerCase()).join(':')
}

module.exports = MongoDBEntity

Object.assign(
  module.exports,
  {
    $database,
    $collection
  }
)