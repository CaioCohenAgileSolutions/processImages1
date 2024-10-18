const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Função para converter uma imagem em Base64
function convertImageToBase64(imagePath) {
    const imageBuffer = fs.readFileSync(imagePath); // Ler imagem como buffer
    return imageBuffer.toString('base64'); // Converter buffer para Base64
}

// Função para enviar a imagem codificada em Base64 via POST e retornar o resultado
async function postImage(base64Image, filename) {
    try {
        const response = await axios.post('https://us-central1-empower-dev-438617.cloudfunctions.net/election-ocr-ms', {
            //const response = await axios.post('http://localhost:3000/api/ocr/tratarVotantes', {
            base64Image: base64Image
        });
        return response.data; // Retornar JSON de resposta
    } catch (error) {
        console.error(`Erro ao enviar a imagem: ${error.message}`);
        //console.error(error);
        return [{ id: filename, votou: false, needsRevision: true }]; // Retornar null em caso de erro para não interromper o fluxo
    }
}

// Função principal para processar apenas as imagens cujos ids precisam de revisão
async function processImages() {
    const directory = './imagens'; // Diretório onde estão as imagens
    //o intuito é subir em uma pasta chamada imagens as paginas
    const allJsonFilePath = path.join(directory, 'all.json');
    let allResults = []; // Array para armazenar todos os resultados
  
    // Verificar se o arquivo all.json existe
    if (fs.existsSync(allJsonFilePath)) {
      console.log('Arquivo all.json encontrado. Filtrando itens para revisão...');
      
      // Ler o arquivo all.json
      const allJsonContent = fs.readFileSync(allJsonFilePath);
      allResults = JSON.parse(allJsonContent);
  
      // Filtrar os itens que têm "needsRevision: true"
      const itemsToRevise = allResults.filter(item => item.needsRevision === true);
  
      if (itemsToRevise.length === 0) {
        console.log('Nenhum item necessita de revisão.');
        return;
      }
  
      console.log(`${itemsToRevise.length} itens necessitam de revisão.`);
      
      // Criar uma lista de promessas para processar as imagens cujos ids estão marcados para revisão
      const promises = [];
  
      for (const item of itemsToRevise) {
        const imageFile = `${item.id}`; // Presumindo que o nome do arquivo de imagem seja o id do item
        const imagePath = path.join(directory, imageFile);
  
        if (fs.existsSync(imagePath)) {
          console.log(`Processando revisão da imagem: ${imageFile}`);
  
          // Converter imagem para Base64
          const base64Image = convertImageToBase64(imagePath);
  
          // Criar uma promessa para enviar a imagem em Base64 e salvar o retorno
          const promise = postImage(base64Image, imageFile).then((result) => {
            if (result) {
              // Adicionar o campo 'needsRevision: false' a cada item do JSON retornado
              const updatedResult = result.map((item) => {
                if (!item.needsRevision){
                    return {
                      ...item, // Manter os campos existentes
                      needsRevision: false // Atualizar para 'false'
                    };
                }else{
                    return item;
                }

              });
  
              // Salvar o JSON atualizado com o mesmo nome da imagem
              const jsonFileName = path.join(directory, `${path.basename(imageFile, '.jpeg')}.json`);
              fs.writeFileSync(jsonFileName, JSON.stringify(updatedResult, null, 2));
  
              console.log(`Salvou revisão em: ${jsonFileName}`);
  
              // Atualizar o arquivo all.json com a nova informação
              const indexToUpdate = allResults.findIndex(i => i.id === item.id);
              if (indexToUpdate !== -1) {
                allResults[indexToUpdate] = { ...item};
              }
            }
          });
  
          // Adicionar a promessa à lista
          promises.push(promise);
        } else {
          console.log(`Arquivo de imagem não encontrado: ${imageFile}`);
        }
      }
  
      // Esperar que todas as promessas sejam resolvidas
      await Promise.all(promises);
  
      // Salvar o arquivo all.json atualizado
      fs.writeFileSync(allJsonFilePath, JSON.stringify(allResults, null, 2));
      console.log('Arquivo all.json atualizado com sucesso.');
    } else {
      console.log('Arquivo all.json não encontrado. Processando todas as imagens.');
  
      // Processar todas as imagens no diretório se o arquivo all.json não existir
      const files = fs.readdirSync(directory); // Ler arquivos do diretório
      const promises = [];
  
      for (const file of files) {
        if (path.extname(file) === '.jpeg') {
          const imagePath = path.join(directory, file);
          console.log(`Processando imagem: ${file}`);
  
          // Converter imagem para Base64
          const base64Image = convertImageToBase64(imagePath);
  
          // Criar uma promessa para enviar a imagem em Base64 e salvar o retorno
          const promise = postImage(base64Image, file).then((result) => {
            if (result) {
              // Adicionar o campo 'needsRevision: false' a cada item do JSON
              const updatedResult = result.map((item) => {
                if (!item.needsRevision){
                    return {
                      ...item, // Manter os campos existentes
                      needsRevision: false // Atualizar para 'false'
                    };
                }else{
                    return item;
                }

              });
  
              // Salvar o JSON de retorno no mesmo diretório, com o mesmo nome da imagem
              const jsonFileName = path.join(directory, `${path.basename(file, '.jpeg')}.json`);
              fs.writeFileSync(jsonFileName, JSON.stringify(updatedResult, null, 2));
  
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
    }
  }

// Chamar a função para processar as imagens
processImages();
