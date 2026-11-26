// Expand only a complete trailing token, never letters within a longer word.
export function expandLetterShortcut(message,bank){
 const match=String(message).match(/(^|\s)([A-Z]+)$/);
 if(!match)return message;
 const replacement=bank[match[2]];
 if(typeof replacement!=='string'||!replacement.trim())return message;
 const result=message.slice(0,message.length-match[2].length)+replacement.trim();
 return result.length<=1000?result:message;
}
