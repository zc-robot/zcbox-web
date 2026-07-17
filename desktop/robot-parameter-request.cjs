function serializeNumber(value, numericType) {
  if (!Number.isFinite(value))
    throw new Error('Robot parameter numbers must be finite')
  if (numericType === 'integer' && !Number.isInteger(value))
    throw new Error('Robot integer parameters must be whole numbers')
  if (numericType === 'double' && Number.isInteger(value))
    return `${Object.is(value, -0) ? '-0' : String(value)}.0`
  return String(value)
}

function serializeParameterValue(value, numericType) {
  if (typeof value === 'number')
    return serializeNumber(value, numericType)

  if (Array.isArray(value)) {
    return `[${value.map(item => typeof item === 'number'
      ? serializeNumber(item, numericType)
      : JSON.stringify(item)).join(',')}]`
  }

  const serialized = JSON.stringify(value)
  if (serialized === undefined)
    throw new Error('Robot parameter values cannot be undefined')
  return serialized
}

function serializeRobotParameterUpdateBody({ keyPath, newValue, numericType }) {
  return `{"key_path":${JSON.stringify(keyPath)},"new_value":${serializeParameterValue(newValue, numericType)}}`
}

module.exports = {
  serializeRobotParameterUpdateBody,
}
