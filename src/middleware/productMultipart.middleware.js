const normalizeRepeatedField = (body, field) => {
    const bracketedField = `${field}[]`;
    if (body[bracketedField] !== undefined) {
        body[field] = body[bracketedField];
    }
    if (body[field] !== undefined && !Array.isArray(body[field])) body[field] = [body[field]];
    delete body[bracketedField];
};

const parseProductMultipart = (req, res, next) => {
    if (req.is('multipart/form-data')) {
        normalizeRepeatedField(req.body, 'categories');
        normalizeRepeatedField(req.body, 'tags');
    }
    next();
};

module.exports = parseProductMultipart;
