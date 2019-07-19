var jp = require('json-query');
const uuidv4 = require('uuid/v4');

class mongoFire {
    constructor(mongoClient, db) {
        this.path = [];
        this.client = mongoClient;
        this.db = db;
    }

    ref(path) {
        try {
            path = cleanPath(path);
            let mongo_ref_temp = new mongoFireRef(this.client, this.db);
            let pieces = path.split('/');
            mongo_ref_temp.path = pieces;
            return mongo_ref_temp;
        } catch (e) {
            throw e;
        }
    }
}
class mongoFireRef {
    constructor(mongoClient, db) {
        this.path = [];
        this.client = mongoClient;
        this.db = db;
    }
    child(fragment) {
        try {
            cleanPath(fragment);
            this.path = pathToPieces(this.path, fragment);
            return this;
        } catch (e) {
            throw e;
        }
    }
    push(obj) {
        try {
            if (this.path.length < 1) {
                throw new Error('No path to push');
            }
            let newKey = 'a' + uuidv4().replace(new RegExp('-', 'g'), '');
            this.path.push(newKey);
            if (obj) {
                this.set(obj);
            }
        } catch (e) {
            throw e;
        }
        return this;
    }
    async once(obj, callback) {
        try {
            let data_arr = await this.db.collection(this.path[0]).find({ _id: this.path[1] }).toArray();
            if (data_arr.length > 0) {
                if (this.path.length > 2) {
                    let data = jp(this.path.slice(2).join('.'), { data: data_arr[0] }).value;
                    let snapshot = new snapshotClass(data);
                    if (callback && typeof callback === 'function') {
                        callback(snapshot)
                    }
                    return snapshot;

                } else {
                    let snapshot = new snapshotClass(data_arr[0]);
                    if (callback && typeof callback === 'function') {
                        callback(snapshot)
                    }
                    return snapshot;
                }
            }
            if (callback && typeof callback === 'function') {
                callback(snapshot)
            }
            return new snapshotClass();
        } catch (e) {
            console.log(e)
            if (callback && typeof callback === 'function') {
                callback(snapshot)
            }
            return new snapshotClass();
        }

    }
    get key() {
        try {
            if (this.path.length < 1) {
                throw new Error('No path provided');
            }
            return this.path[this.path.length - 1]
        } catch (e) {
            throw e;
        }
    }
    async update(data) {
        try {

            let that = this;
            let doc = await that.docExists(that.path[0], that.path[1]);
            if (doc.length == 0) {
                throw new Error("No document to update");
            }
            let docs = []
            if(this.path.length > 2){
                let ref_path = that.path.slice(2).join('.');
                let find_query = {};
                find_query['_id'] = that.path[1];
                find_query[ref_path] = { '$exists': true };
                docs = await that.db.collection(that.path[0]).find(find_query).toArray();
                if (docs.length > 0) {
                    let main_doc = docs[0];
                    let refDoc = jp(this.path.slice(2).join('.'), { data: main_doc }).value || {};
                    Object.assign(refDoc, data);
                    //jp.value(main_doc, ref_path, data);
                    let setObject = { '$set': {} };
                    setObject['$set'][ref_path] = refDoc;
                    console.log(setObject)
                    await that.db.collection(that.path[0]).findOneAndUpdate({ '_id': that.path[1] }, setObject);
                }else{
                    throw new Error('No document to update');
                }
            }else{
                let find_query = {};
                find_query['_id'] = that.path[1];
                docs = await that.db.collection(that.path[0]).find(find_query).toArray();
                if (docs.length > 0) {
                    let main_doc = docs[0];
                    Object.assign(main_doc, data);
                    //jp.value(main_doc, ref_path, data);
                    let setObject = { '$set': main_doc };
                    console.log(setObject)
                    await that.db.collection(that.path[0]).findOneAndUpdate({ '_id': that.path[1] }, setObject);
                }else{
                    throw new Error('No document to update');
                }
            }
            
        } catch (e) {
            throw e
        }

        return this;
    }
    async set(data) {
        let that = this;
        let ref_path = '';
        for (let index = 1; index < that.path.length; index++) {
            if (index == 1) {
                let doc = await that.docExists(that.path[0], that.path[index]);
                if (doc.length == 0) {
                    await that.db.collection(that.path[0]).insertOne({
                        _id: that.path[index]
                    })
                }
                if (index == that.path.length - 1) {
                    await that.db.collection(that.path[0]).findOneAndUpdate({ '_id': that.path[1] }, { '$set': data });
                }
            } else {
                let old_ref = ref_path;
                ref_path = ref_path + `${that.path[index]}.`
                let find_query = {};
                find_query['_id'] = that.path[1];
                find_query[ref_path.replace(/\.$/, "")] = {'$exists':true};
                let docs = await that.db.collection(that.path[0]).find(find_query).toArray();
                if (docs.length < 1) {
                    let main_doc = await that.db.collection(that.path[0]).find({ '_id': that.path[1] }).toArray();
                    main_doc = main_doc[0];
                    if (old_ref.length < 1) {
                        if (index == that.path.length - 1) {
                            main_doc[that.path[index]] = data;
                        } else {
                            main_doc[that.path[index]] = jp(that.path[index], { data: main_doc }).value || {};
                        }
                        await that.db.collection(that.path[0]).findOneAndUpdate({ '_id': that.path[1] }, { '$set': main_doc });
                    } else {
                        old_ref = old_ref.substr(0, old_ref.length - 1);
                        let updateDoc = {}
                        if (index == that.path.length - 1) {
                            updateDoc[that.path[index]] = data;
                        } else {
                            updateDoc[that.path[index]] = {};
                        }
                        let pre_data = jp(old_ref, { data: main_doc }).value;
                        let temp = {}
                        if (pre_data.length > 0 && pre_data != null) {
                            temp = pre_data[0];
                            if (typeof (pre_data[that.path[index]]) != 'undefined' && index !== that.path.length - 1) {
                            } else {
                                Object.assign(temp, updateDoc)
                            }
                        } else {
                            temp = updateDoc;
                        }
                        let setObject = { '$set': {} };
                        setObject['$set'][old_ref] = temp;
                        await that.db.collection(that.path[0]).findOneAndUpdate({ '_id': that.path[1] }, setObject);
                    }
                }
            }
        }
        return this;
    }
    async docExists(main, id) {
        return await this.db.collection(main).find({ '_id': id }).toArray();
    }
}
function cleanPath(path) {
    if (typeof path === 'undefined') {
        throw new Error('Path invalid');
    }
    path = path.trim();
    if (path[0] === '/') {
        path.shift()
    }
    if (path[path.length - 1] === '/') {
        path.splice(path.length - 1, 1)
    }
    if (path.length < 1) {
        throw new Error('Path invalid');
    }
    return path;
}
function pathToPieces(path, fragment) {
    let pieces = fragment.split('/');
    return path.concat(pieces);
}

class snapshotClass {
    constructor(value) {
        let data = value || null;
        this.val = function () {
            return data;
        }
    }
}

exports.mongoFire = mongoFire;
