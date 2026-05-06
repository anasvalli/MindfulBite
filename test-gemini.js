const key = 'AIzaSyBYnMdy0E9X-w53CjUK_eyHFW9APFHNDXo';
fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
  .then(res => res.json())
  .then(data => {
    const models = data.models.map(m => m.name);
    console.log(models.join('\n'));
  })
  .catch(console.error);
