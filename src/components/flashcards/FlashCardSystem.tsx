import React from 'react';
import { FlashCard } from '@/types/flashcard';
import { FlashCardBase } from './FlashCardBase';
import { StandardCard } from './StandardCard';
import { MCQCard } from './MCQCard';
import { TrueFalseCard } from './TrueFalseCard';
import { FillInBlankCard } from './FillInBlankCard';
import { ImageCard } from './ImageCard';
import { MatchCard } from './MatchCard';
import { AudioCard } from './AudioCard';
import { VoiceCard } from './VoiceCard';
import { CaseCard } from './CaseCard';
import { FormulaCard } from './FormulaCard';

interface FlashCardSystemProps {
  cards: FlashCard[];
  currentIndex: number;
  onAction: (action: 'dont-know' | 'review' | 'mastered') => void;
  onNext: () => void;
}

export const FlashCardSystem: React.FC<FlashCardSystemProps> = ({
  cards,
  currentIndex,
  onAction,
  onNext
}) => {
  const card = cards[currentIndex];

  if (!card) return null;

  const renderCardContent = () => {
    switch (card.type) {
      case 'standard':
        return <StandardCard question={card.question} answer={card.answer} />;
      case 'mcq':
        return (
          <MCQCard 
            question={card.question} 
            options={card.options || []} 
            correctOptionIndex={card.correctOptionIndex || 0}
            explanation={card.explanation}
          />
        );
      case 'true-false':
        return <TrueFalseCard statement={card.question} correctAnswer={card.answer === 'true'} />;
      case 'fill-blank':
        return <FillInBlankCard question={card.question} answer={card.answer} explanation={card.explanation} />;
      case 'image':
        return <ImageCard question={card.question} imageUrl={card.imageUrl || ''} answer={card.answer} />;
      case 'match':
        return <MatchCard pairs={card.pairs || []} />;
      case 'audio':
        return <AudioCard question={card.question} audioUrl={card.audioUrl || ''} answer={card.answer} />;
      case 'voice':
        return <VoiceCard question={card.question} answer={card.answer} />;
      case 'case':
        return (
          <CaseCard 
            scenario={card.scenario || ''} 
            question={card.question} 
            answer={card.answer} 
            explanation={card.explanation}
          />
        );
      case 'formula':
        return <FormulaCard formula={card.question} explanation={card.explanation || ''} />;
      default:
        return <StandardCard question={card.question} answer={card.answer} />;
    }
  };

  return (
    <FlashCardBase
      card={card}
      currentIndex={currentIndex}
      totalCards={cards.length}
      onAction={onAction}
      onNext={onNext}
      isAiGenerated={card.isAiGenerated}
    >
      {renderCardContent()}
    </FlashCardBase>
  );
};
