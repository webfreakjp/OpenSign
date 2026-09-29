// Prefix document emails with the owner's company without changing the selected sender name.
export async function documentMailFrom(displayName, address, extUserId) {
  let company = '';
  if (extUserId) {
    try {
      const query = new Parse.Query('contracts_Users');
      query.equalTo('objectId', extUserId);
      query.select(['Company']);
      const owner = await query.first({ useMasterKey: true });
      company = owner?.get('Company');
    } catch {
      // An unavailable profile must not prevent an otherwise valid email from being sent.
      console.warn('Could not load the sender company for a document email.');
    }
  }

  const name = [company, displayName]
    .map(value => (typeof value === 'string' ? value.replace(/[\r\n]+/g, ' ').trim() : ''))
    .filter(Boolean)
    .join(' ');
  if (!name) return address;

  // Quote the entire name so commas, quotes and angle brackets remain display-name text.
  const quotedName = name.replace(/[\\"]/g, '\\$&');
  return `"${quotedName}" <${address}>`;
}
