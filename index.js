const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Parser } = require('json2csv');

// Função para converter uma imagem em Base64
function convertImageToBase64(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath); // Ler imagem como buffer
  return imageBuffer.toString('base64'); // Converter buffer para Base64
}

// Função para enviar a imagem codificada em Base64 via POST e retornar o resultado
async function postImage(base64Image, filename) {
  try {
    //const response = await axios.post('https://us-central1-empower-dev-438617.cloudfunctions.net/election-ocr-ms', {
    const response = await axios.post('http://localhost:3300/api/ocr/tratarVotantes', {
      base64Image: base64Image
    });
    return response.data; // Retornar JSON de resposta
  } catch (error) {
    console.error(`Erro ao enviar a imagem: ${error.message}`);
    //console.error(error);
    return [{ id: filename, votou: false, needsRevision: true }]; // Retornar null em caso de erro para não interromper o fluxo
  }
}

function getAllJpgFiles(directory) {
  let files = [];

  // Ler o conteúdo do diretório
  const items = fs.readdirSync(directory);

  items.forEach(item => {
    const fullPath = path.join(directory, item);

    // Verifica se é uma pasta ou um arquivo
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      // Se for uma pasta, chama a função recursivamente
      files = files.concat(getAllJpgFiles(fullPath));
    } else if (stats.isFile() && item.endsWith('.JPG')) {
      // Se for um arquivo .jpg, adiciona à lista
      files.push(fullPath);
    }
  });

  return files;
}

function deleteTempFile(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error(`Erro ao excluir o arquivo temporário: ${filePath}`, err);
    } else {
      console.log(`Arquivo temporário excluído: ${filePath}`);
    }
  });
}

// Função principal para processar apenas as imagens cujos ids precisam de revisão
async function processImages() {
  const directory = './imagens'; // Diretório onde estão as imagens
  //o intuito é subir em uma pasta chamada imagens as paginas
  const allJsonFilePath = path.join(directory, 'all.json');
  let allResults = []; // Array para armazenar todos os resultados

  // Verificar se o arquivo all.json existe
  console.log('Arquivo all.json não encontrado. Processando todas as imagens.');

  // Processar todas as imagens no diretório se o arquivo all.json não existir
  const files = getAllJpgFiles(directory); // Ler arquivos do diretório
  const promises = [];
  let i = 0;
  for (const file of files) {
    if(i <= 19){
      break;
    }
    i++;
    if (path.extname(file) === '.JPG') {
      const imagePath = file;
      console.log(`Processando imagem: ${file}`);

      // Converter imagem para Base64
      const base64Image = convertImageToBase64(imagePath);

      // Criar uma promessa para enviar a imagem em Base64 e salvar o retorno
      const promise = postImage(base64Image, file).then((result) => {
        if (result) {
          // Adicionar o campo 'needsRevision: false' a cada item do JSON
          const updatedResult = result.map((item) => {
            if (!item.needsRevision) {
              return {
                ...item, // Manter os campos existentes
                needsRevision: false // Atualizar para 'false'
              };
            } else {
              return item;
            }

          });

          // Salvar o JSON de retorno no mesmo diretório, com o mesmo nome da imagem
          const jsonFileName = path.join(directory, `${path.basename(file, '.JPG')}_${i}.json`);
          //fs.writeFileSync(jsonFileName, JSON.stringify(updatedResult, null, 2));

          console.log(`Salvou resposta em: ${jsonFileName}`);

          // Adicionar os resultados ao array geral
          allResults.push(...updatedResult); // Concatenar os itens no array allResults
        }
      });

      // Adicionar a promessa à lista
      promises.push(promise);
    }
  }

  // Esperar que todas as promessas sejam resolvidas
  await Promise.all(promises);

  // Salvar o arquivo final 'all.json' com a concatenação de todos os resultados
  fs.writeFileSync(allJsonFilePath, JSON.stringify(allResults, null, 2));
  console.log('Arquivo all.json salvo com sucesso.');

  //CONVERTER JSON PRA .CSV
  const jsonData = JSON.parse(fs.readFileSync(allJsonFilePath, 'utf8'));
  const fields = ['id', 'votou', 'needsRevision', 'title', 'number'];
  const opts = { fields };
  try {
    // Cria o parser CSV e converte o JSON
    const parser = new Parser(opts);
    const csv = parser.parse(jsonData);
  
    // Escreve o resultado CSV em um arquivo
    fs.writeFileSync('output.csv', csv);
    console.log('Arquivo CSV criado com sucesso!');
  } catch (err) {
    console.error('Erro ao converter JSON para CSV:', err);
  }
}

// Chamar a função para processar as imagens
processImages();
